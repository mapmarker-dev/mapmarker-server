import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { Prisma } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { truncateAll } from './setup/database';

/**
 * DB 스키마가 규칙대로 막고 지우는지 확인한다. API가 아직 없어서 Prisma로 테스트 DB에 직접 넣어 본다.
 * 마이그레이션 SQL에 손으로 넣은 제약(CHECK, 미룰 수 있는 유일 제약)도 여기서 확인한다.
 */
describe('DB 스키마 (e2e)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ---- 만들기 도우미. 앱처럼 ID를 직접 넣는다. ----

  async function createUser() {
    return prisma.user.create({ data: {} });
  }

  async function createTrip(
    data: Partial<Prisma.TripUncheckedCreateInput> = {},
  ) {
    const userId = data.userId ?? (await createUser()).id;
    return prisma.trip.create({
      data: {
        id: randomUUID(),
        title: '부산 2박 3일 가을 여행',
        region: '부산',
        nights: 2,
        season: 'autumn',
        ...data,
        userId,
      },
    });
  }

  async function createStop(
    tripId: string,
    data: Partial<Prisma.StopUncheckedCreateInput> = {},
  ) {
    return prisma.stop.create({
      data: {
        id: randomUUID(),
        tripId,
        day: 1,
        order: 0,
        latitude: 35.1587,
        longitude: 129.1604,
        name: '해운대',
        ...data,
      },
    });
  }

  async function createSegment(
    tripId: string,
    fromStopId: string,
    toStopId: string,
    data: Partial<Prisma.SegmentUncheckedCreateInput> = {},
  ) {
    return prisma.segment.create({
      data: { id: randomUUID(), tripId, fromStopId, toStopId, ...data },
    });
  }

  /** 1일차에 장소 [count]개를 순서대로 넣는다. */
  async function createStops(tripId: string, count: number) {
    const stops = [];
    for (let order = 0; order < count; order++) {
      stops.push(await createStop(tripId, { order, name: `장소 ${order}` }));
    }
    return stops;
  }

  describe('User', () => {
    it('ID는 서버가 UUID v7로 만든다', async () => {
      const user = await createUser();

      expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]/);
    });
  });

  describe('Trip', () => {
    it('기간이 없는 여행(날짜 미정)을 저장한다', async () => {
      const trip = await createTrip();

      expect(trip).toMatchObject({
        startDate: null,
        endDate: null,
        phaseOverride: null,
        origin: 'manual',
      });
    });

    it('기간은 시간대 없는 날짜 그대로 읽힌다', async () => {
      const trip = await createTrip({
        startDate: new Date('2026-10-15'),
        endDate: new Date('2026-10-17'),
        nights: 2,
      });

      const saved = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });
      expect(saved.startDate?.toISOString().slice(0, 10)).toBe('2026-10-15');
      expect(saved.endDate?.toISOString().slice(0, 10)).toBe('2026-10-17');
    });

    it('기간은 둘 다 있거나 둘 다 없어야 한다', async () => {
      await expect(
        createTrip({ startDate: new Date('2026-10-15') }),
      ).rejects.toThrow('trips_dates_both_or_none_check');
    });

    it('종료일이 시작일보다 앞이면 거절한다', async () => {
      await expect(
        createTrip({
          startDate: new Date('2026-10-17'),
          endDate: new Date('2026-10-15'),
          nights: 0,
        }),
      ).rejects.toThrow('trips_dates_order_check');
    });

    it('기간이 있으면 박 수가 기간과 같아야 한다', async () => {
      await expect(
        createTrip({
          startDate: new Date('2026-10-15'),
          endDate: new Date('2026-10-17'),
          nights: 3,
        }),
      ).rejects.toThrow('trips_nights_match_dates_check');
    });

    it('박 수는 0 이상이다', async () => {
      await expect(createTrip({ nights: -1 })).rejects.toThrow(
        'trips_nights_check',
      );
    });

    it('공유 ID는 겹칠 수 없다', async () => {
      await createTrip({ shareId: 'abc' });

      await expect(createTrip({ shareId: 'abc' })).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('원본 여행을 지우면 복사본은 남고 원본 칸만 비운다', async () => {
      const original = await createTrip();
      const copy = await createTrip({
        origin: 'copy',
        copiedFromTripId: original.id,
      });

      await prisma.trip.delete({ where: { id: original.id } });

      const saved = await prisma.trip.findUniqueOrThrow({
        where: { id: copy.id },
      });
      expect(saved).toMatchObject({ origin: 'copy', copiedFromTripId: null });
    });
  });

  describe('Stop', () => {
    it('예정 시각은 현지 시:분, 방문 시각은 순간 그대로 읽힌다', async () => {
      const trip = await createTrip();
      const visitedAt = new Date('2026-10-15T01:23:45.678Z');
      const stop = await createStop(trip.id, {
        plannedTime: new Date('1970-01-01T09:30:00Z'),
        visited: true,
        visitedAt,
      });

      const saved = await prisma.stop.findUniqueOrThrow({
        where: { id: stop.id },
      });
      expect(saved.plannedTime?.toISOString().slice(11, 16)).toBe('09:30');
      expect(saved.visitedAt).toEqual(visitedAt);
      expect(saved).toMatchObject({
        kind: 'other',
        description: '',
        memo: '',
        timeZone: 'Asia/Seoul',
        placeProvider: null,
        placeId: null,
      });
    });

    it('같은 여행의 같은 일차·순서에는 장소를 둘 넣을 수 없다', async () => {
      const trip = await createTrip();
      await createStop(trip.id, { day: 1, order: 0 });

      await expect(createStop(trip.id, { day: 1, order: 0 })).rejects.toThrow(
        'stops_trip_id_day_sort_order_key',
      );
    });

    it('한 트랜잭션 안에서는 순서가 잠깐 겹쳐도 된다 (맞바꾸기)', async () => {
      const trip = await createTrip();
      const [first, second] = await createStops(trip.id, 2);

      await prisma.$transaction([
        prisma.stop.update({ where: { id: first.id }, data: { order: 1 } }),
        prisma.stop.update({ where: { id: second.id }, data: { order: 0 } }),
      ]);

      const orders = await prisma.stop.findMany({
        where: { tripId: trip.id },
        orderBy: { order: 'asc' },
        select: { id: true },
      });
      expect(orders.map(({ id }) => id)).toEqual([second.id, first.id]);
    });

    it('맨 앞에 넣으려고 그 일차의 장소를 한 칸씩 한 번에 민다', async () => {
      const trip = await createTrip();
      await createStops(trip.id, 3);

      await prisma.stop.updateMany({
        where: { tripId: trip.id, day: 1 },
        data: { order: { increment: 1 } },
      });

      const orders = await prisma.stop.findMany({
        where: { tripId: trip.id },
        orderBy: { order: 'asc' },
      });
      expect(orders.map(({ order }) => order)).toEqual([1, 2, 3]);
    });

    it('트랜잭션이 끝날 때 순서가 겹쳐 있으면 통째로 되돌린다', async () => {
      const trip = await createTrip();
      const [first] = await createStops(trip.id, 2);

      await expect(
        prisma.$transaction([
          prisma.stop.update({
            where: { id: first.id },
            data: { name: '바뀜' },
          }),
          prisma.stop.update({ where: { id: first.id }, data: { order: 1 } }),
        ]),
        // 커밋할 때 걸린 오류는 메시지에 제약 이름 없이 종류만 온다.
      ).rejects.toThrow('UniqueConstraintViolation');

      const saved = await prisma.stop.findUniqueOrThrow({
        where: { id: first.id },
      });
      expect(saved).toMatchObject({ name: '장소 0', order: 0 });
    });

    it('일차는 1부터, 순서는 0부터다', async () => {
      const trip = await createTrip();

      await expect(createStop(trip.id, { day: 0 })).rejects.toThrow(
        'stops_day_check',
      );
      await expect(createStop(trip.id, { order: -1 })).rejects.toThrow(
        'stops_sort_order_check',
      );
    });

    it('좌표는 위경도 범위 안이어야 한다', async () => {
      const trip = await createTrip();

      await expect(createStop(trip.id, { latitude: 90.1 })).rejects.toThrow(
        'stops_latitude_check',
      );
      await expect(createStop(trip.id, { longitude: -180.1 })).rejects.toThrow(
        'stops_longitude_check',
      );
    });
  });

  describe('Segment', () => {
    it('기본은 이동 수단 미정, 직선, 일반 구간이고, 이동 수단 목록은 그대로 읽힌다', async () => {
      const trip = await createTrip();
      const [a, b, c] = await createStops(trip.id, 3);
      const legs = [
        { mode: 'subway', stopCount: 2 },
        { mode: 'walk', durationMinutes: 5 },
      ];

      const empty = await createSegment(trip.id, a.id, b.id);
      const filled = await createSegment(trip.id, b.id, c.id, {
        legs,
        curvature: -0.4,
        type: 'gpsTrack',
      });

      expect(empty).toMatchObject({ legs: [], curvature: 0, type: 'normal' });
      expect(filled).toMatchObject({ legs, curvature: -0.4, type: 'gpsTrack' });
    });

    it('한 장소에서 나가는 구간은 하나다', async () => {
      const trip = await createTrip();
      const [a, b, c] = await createStops(trip.id, 3);
      await createSegment(trip.id, a.id, b.id);

      await expect(createSegment(trip.id, a.id, c.id)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('한 장소로 들어오는 구간은 하나다', async () => {
      const trip = await createTrip();
      const [a, b, c] = await createStops(trip.id, 3);
      await createSegment(trip.id, a.id, c.id);

      await expect(createSegment(trip.id, b.id, c.id)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('양 끝이 같은 장소인 구간은 없다', async () => {
      const trip = await createTrip();
      const [a] = await createStops(trip.id, 1);

      await expect(createSegment(trip.id, a.id, a.id)).rejects.toThrow(
        'segments_distinct_stops_check',
      );
    });

    it('곡률은 -1~1이다', async () => {
      const trip = await createTrip();
      const [a, b] = await createStops(trip.id, 2);

      await expect(
        createSegment(trip.id, a.id, b.id, { curvature: 1.5 }),
      ).rejects.toThrow('segments_curvature_check');
    });

    it('이동 수단 목록은 배열이어야 한다', async () => {
      const trip = await createTrip();
      const [a, b] = await createStops(trip.id, 2);

      await expect(
        createSegment(trip.id, a.id, b.id, { legs: { mode: 'walk' } }),
      ).rejects.toThrow('segments_legs_array_check');
    });

    it('장소를 지우면 그 장소에 닿은 구간만 함께 지워진다', async () => {
      const trip = await createTrip();
      const [a, b, c, d] = await createStops(trip.id, 4);
      await createSegment(trip.id, a.id, b.id);
      await createSegment(trip.id, b.id, c.id);
      const kept = await createSegment(trip.id, c.id, d.id);

      await prisma.stop.delete({ where: { id: b.id } });

      const segments = await prisma.segment.findMany({
        where: { tripId: trip.id },
      });
      expect(segments.map(({ id }) => id)).toEqual([kept.id]);
    });
  });

  describe('Photo', () => {
    async function createTripWithPhoto() {
      const user = await createUser();
      const trip = await createTrip({ userId: user.id });
      const stop = await createStop(trip.id);
      const photoId = randomUUID();
      const photo = await prisma.photo.create({
        data: {
          id: photoId,
          stopId: stop.id,
          storageKey: `users/${user.id}/trips/${trip.id}/photos/${photoId}.jpg`,
        },
      });
      return { user, trip, stop, photo };
    }

    it('사진이 남은 장소·여행·회원은 지울 수 없다 (S3 파일부터 지우게)', async () => {
      const { user, trip, stop } = await createTripWithPhoto();

      await expect(
        prisma.stop.delete({ where: { id: stop.id } }),
      ).rejects.toThrow('photos_stop_id_fkey');
      await expect(
        prisma.trip.delete({ where: { id: trip.id } }),
      ).rejects.toThrow('photos_stop_id_fkey');
      await expect(
        prisma.user.delete({ where: { id: user.id } }),
      ).rejects.toThrow('photos_stop_id_fkey');
      expect(await prisma.photo.count()).toBe(1);
    });

    it('사진을 먼저 지우면 여행을 지울 수 있다', async () => {
      const { trip, photo } = await createTripWithPhoto();

      await prisma.photo.delete({ where: { id: photo.id } });
      await prisma.trip.delete({ where: { id: trip.id } });

      expect(await prisma.stop.count()).toBe(0);
    });

    it('S3 키는 겹칠 수 없다', async () => {
      const { stop, photo } = await createTripWithPhoto();

      await expect(
        prisma.photo.create({
          data: {
            id: randomUUID(),
            stopId: stop.id,
            storageKey: photo.storageKey,
          },
        }),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('삭제 연쇄', () => {
    it('여행을 지우면 장소와 구간이 함께 지워진다', async () => {
      const trip = await createTrip();
      const [a, b] = await createStops(trip.id, 2);
      await createSegment(trip.id, a.id, b.id);

      await prisma.trip.delete({ where: { id: trip.id } });

      expect(await prisma.stop.count()).toBe(0);
      expect(await prisma.segment.count()).toBe(0);
    });

    it('회원을 지우면 여행이 함께 지워진다', async () => {
      const user = await createUser();
      await createTrip({ userId: user.id });
      await createTrip({ userId: user.id });

      await prisma.user.delete({ where: { id: user.id } });

      expect(await prisma.trip.count()).toBe(0);
    });
  });
});
