import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createUserWithToken } from './setup/auth';
import { truncateAll } from './setup/database';
import { uuidv7 } from './setup/ids';

describe('여행 API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  /** 요청하는 사용자(나). */
  let me: { userId: string; token: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    me = await createUserWithToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- 요청 도우미 ----

  const api = () => request(app.getHttpServer());

  function newTrip(body: Record<string, unknown> = {}) {
    return {
      id: uuidv7(),
      title: '부산 2박 3일 가을 여행',
      region: '부산',
      nights: 2,
      season: 'autumn',
      dates: { start: '2026-10-15', end: '2026-10-17' },
      ...body,
    };
  }

  function createTrip(body: Record<string, unknown>, token = me.token) {
    return api()
      .post('/v1/trips')
      .set('Authorization', bearer(token))
      .send(body);
  }

  /** 여행을 만들고 응답 본문을 돌려준다. */
  async function created(body: Record<string, unknown> = {}) {
    const response = await createTrip(newTrip(body)).expect(201);
    return response.body as { id: string; updatedAt: string };
  }

  function addStop(tripId: string, data: { day: number; order: number }) {
    return prisma.stop.create({
      data: {
        id: uuidv7(),
        tripId,
        latitude: 35.1587,
        longitude: 129.1604,
        name: `장소 ${data.day}-${data.order}`,
        ...data,
      },
    });
  }

  describe('만들기', () => {
    it('만든 여행을 앱 모델과 같은 모양으로 돌려준다', async () => {
      const body = newTrip({ phaseOverride: 'during' });

      const response = await createTrip(body).expect(201);

      expect(response.body).toEqual({
        ...body,
        mapProvider: null,
        origin: 'manual',
        copiedFromTripId: null,
        shareId: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('기간이 없는 여행(날짜 미정)은 dates가 null이고 상태는 자동이다', async () => {
      const response = await createTrip(
        newTrip({ dates: undefined, nights: 0 }),
      ).expect(201);

      expect(response.body).toMatchObject({
        nights: 0,
        dates: null,
        phaseOverride: null,
      });
    });

    it('UUID v4 ID는 "UUID v7이어야 한다"는 메시지로 400', async () => {
      const response = await createTrip(newTrip({ id: randomUUID() })).expect(
        400,
      );

      expect(response.body.message).toEqual([
        'id는 앱이 만든 UUID v7이어야 합니다',
      ]);
    });

    it('이미 있는 ID면 409 (다른 사람의 여행 ID여도)', async () => {
      const body = newTrip();
      await createTrip(body).expect(201);
      await createTrip(body).expect(409);

      const other = await createUserWithToken(app);
      await createTrip(newTrip({ id: body.id }), other.token).expect(409);
    });

    it.each([
      ['UUID v7이 아닌 ID', { id: randomUUID() }],
      ['서버가 정하는 필드', { origin: 'ai' }],
      ['모르는 필드', { color: 'red' }],
      ['빈 제목', { title: '   ' }],
      ['너무 긴 제목', { title: '가'.repeat(101) }],
      ['너무 긴 지역', { region: '가'.repeat(51) }],
      ['음수 박 수', { nights: -1, dates: undefined }],
      ['366박', { nights: 366, dates: undefined }],
      ['모르는 계절', { season: 'monsoon' }],
      ['달력에 없는 날', { dates: { start: '2026-02-30', end: '2026-03-01' } }],
      [
        '종료일이 시작일보다 앞',
        { dates: { start: '2026-10-17', end: '2026-10-15' } },
      ],
      ['기간과 맞지 않는 박 수', { nights: 3 }],
      ['기간의 한쪽만', { dates: { start: '2026-10-15' } }],
      ['모르는 상태', { phaseOverride: 'done' }],
    ])('%s는 400', async (_, body) => {
      await createTrip(newTrip(body)).expect(400);
    });
  });

  describe('목록', () => {
    it('내 여행만, 최근에 고친 순서로 돌려준다', async () => {
      const first = await created({ title: '첫 여행' });
      const second = await created({ title: '두 번째 여행' });
      await createTrip(newTrip(), (await createUserWithToken(app)).token);
      await api()
        .patch(`/v1/trips/${first.id}`)
        .set('Authorization', bearer(me.token))
        .send({ title: '첫 여행 (고침)' })
        .expect(200);

      const response = await api()
        .get('/v1/trips')
        .set('Authorization', bearer(me.token))
        .expect(200);

      expect(
        response.body.map((trip: { id: string; title: string }) => trip.title),
      ).toEqual(['첫 여행 (고침)', '두 번째 여행']);
      expect(response.body[1].id).toBe(second.id);
    });
  });

  describe('하나 조회', () => {
    it('여행과 장소·구간을 동선 순서대로, 앱 모델 모양으로 돌려준다', async () => {
      const trip = await created();
      // 넣는 순서를 섞어서, 응답이 (일차, 순서)로 정렬되는지 본다.
      const c = await addStop(trip.id, { day: 2, order: 0 });
      const a = await addStop(trip.id, { day: 1, order: 0 });
      const b = await prisma.stop.create({
        data: {
          id: uuidv7(),
          tripId: trip.id,
          day: 1,
          order: 1,
          latitude: 35.1,
          longitude: 129.0,
          name: '광안리',
          kind: 'food',
          memo: '메모',
          plannedTime: new Date('1970-01-01T09:30:00Z'),
          placeProvider: 'naver',
          placeId: 'p1',
        },
      });
      const bc = await prisma.segment.create({
        data: {
          id: uuidv7(),
          tripId: trip.id,
          fromStopId: b.id,
          toStopId: c.id,
        },
      });
      const ab = await prisma.segment.create({
        data: {
          id: uuidv7(),
          tripId: trip.id,
          fromStopId: a.id,
          toStopId: b.id,
          legs: [
            { mode: 'subway', stopCount: 2 },
            { mode: 'walk', durationMinutes: 5 },
          ],
          curvature: 0.3,
        },
      });

      const response = await api()
        .get(`/v1/trips/${trip.id}`)
        .set('Authorization', bearer(me.token))
        .expect(200);

      expect(response.body.trip).toMatchObject({ id: trip.id });
      expect(response.body.stops.map((s: { id: string }) => s.id)).toEqual([
        a.id,
        b.id,
        c.id,
      ]);
      expect(response.body.stops[1]).toEqual({
        id: b.id,
        tripId: trip.id,
        day: 1,
        order: 1,
        latitude: 35.1,
        longitude: 129.0,
        name: '광안리',
        kind: 'food',
        description: '',
        memo: '메모',
        plannedTime: '09:30',
        visited: false,
        visitedAt: null,
        timeZone: 'Asia/Seoul',
        placeProvider: 'naver',
        placeId: 'p1',
      });
      expect(response.body.segments).toEqual([
        {
          id: ab.id,
          tripId: trip.id,
          fromStopId: a.id,
          toStopId: b.id,
          legs: [
            { mode: 'subway', stopCount: 2 },
            { mode: 'walk', durationMinutes: 5 },
          ],
          curvature: 0.3,
          type: 'normal',
        },
        expect.objectContaining({ id: bc.id, legs: [], curvature: 0 }),
      ]);
    });

    it('UUID v7이 아닌 경로는 400, 없는 여행은 404', async () => {
      for (const tripId of ['not-a-uuid', randomUUID()]) {
        const response = await api()
          .get(`/v1/trips/${tripId}`)
          .set('Authorization', bearer(me.token))
          .expect(400);
        expect(response.body.message).toBe(
          'tripId는 앱이 만든 UUID v7이어야 합니다',
        );
      }
      await api()
        .get(`/v1/trips/${uuidv7()}`)
        .set('Authorization', bearer(me.token))
        .expect(404);
    });
  });

  describe('고치기', () => {
    function patch(tripId: string, body: Record<string, unknown>) {
      return api()
        .patch(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .send(body);
    }

    it('여행 상태: 직접 바꾼 상태를 저장하고, null이면 자동으로 되돌린다', async () => {
      const trip = await created();

      const changed = await patch(trip.id, { phaseOverride: 'during' }).expect(
        200,
      );
      expect(changed.body.phaseOverride).toBe('during');

      const reset = await patch(trip.id, { phaseOverride: null }).expect(200);
      expect(reset.body.phaseOverride).toBeNull();
    });

    it('보낸 필드만 바꾸고, 고친 시각이 바뀐다', async () => {
      const trip = await created();

      const response = await patch(trip.id, {
        title: '새 제목',
        mapProvider: 'naver',
      }).expect(200);

      expect(response.body).toMatchObject({
        title: '새 제목',
        mapProvider: 'naver',
        region: '부산',
        nights: 2,
        dates: { start: '2026-10-15', end: '2026-10-17' },
      });
      expect(response.body.updatedAt > trip.updatedAt).toBe(true);
    });

    it('기간과 박 수는 바꾼 뒤의 값끼리 맞아야 한다', async () => {
      const trip = await created();

      await patch(trip.id, { nights: 3 }).expect(400);
      await patch(trip.id, {
        dates: { start: '2026-10-15', end: '2026-10-18' },
      }).expect(400);
      await patch(trip.id, {
        nights: 3,
        dates: { start: '2026-10-15', end: '2026-10-18' },
      }).expect(200);

      // 날짜를 지우면(날짜 미정) 박 수는 자유롭게 바꿀 수 있다.
      const undated = await patch(trip.id, { dates: null, nights: 5 }).expect(
        200,
      );
      expect(undated.body).toMatchObject({ dates: null, nights: 5 });
    });

    it('기간을 줄였는데 뒤 일차에 장소가 남으면 409, 장소가 없는 일차까지는 줄일 수 있다', async () => {
      const trip = await created();
      await addStop(trip.id, { day: 2, order: 0 });

      await patch(trip.id, {
        nights: 0,
        dates: { start: '2026-10-15', end: '2026-10-15' },
      }).expect(409);
      await patch(trip.id, {
        nights: 1,
        dates: { start: '2026-10-15', end: '2026-10-16' },
      }).expect(200);
    });

    it.each([
      ['null 제목', { title: null }],
      ['null 박 수', { nights: null }],
      ['ID 바꾸기', { id: uuidv7() }],
      ['서버가 정하는 필드', { shareId: 'abc' }],
    ])('%s는 400', async (_, body) => {
      const trip = await created();
      await patch(trip.id, body).expect(400);
    });
  });

  describe('지우기(휴지통으로 옮기기)', () => {
    function trash(tripId: string, token = me.token) {
      return api()
        .delete(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(token));
    }

    it('204이고 목록·조회에서 빠진다. 장소·구간은 휴지통에 남는다', async () => {
      const trip = await created();
      const kept = await created();
      const a = await addStop(trip.id, { day: 1, order: 0 });
      const b = await addStop(trip.id, { day: 1, order: 1 });
      await prisma.segment.create({
        data: {
          id: uuidv7(),
          tripId: trip.id,
          fromStopId: a.id,
          toStopId: b.id,
        },
      });

      await trash(trip.id).expect(204);

      await api()
        .get(`/v1/trips/${trip.id}`)
        .set('Authorization', bearer(me.token))
        .expect(404);
      const list = await api()
        .get('/v1/trips')
        .set('Authorization', bearer(me.token))
        .expect(200);
      expect(list.body.map((t: { id: string }) => t.id)).toEqual([kept.id]);
      const row = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(await prisma.stop.count()).toBe(2);
      expect(await prisma.segment.count()).toBe(1);
    });

    it('고친 시각은 그대로다 (되살리면 원래 자리로 돌아간다)', async () => {
      const trip = await created();
      const before = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });

      await trash(trip.id).expect(204);

      const after = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('사진이 달린 장소가 있어도 옮긴다 (사진은 영구 삭제 때 지운다)', async () => {
      const trip = await created();
      const stop = await addStop(trip.id, { day: 1, order: 0 });
      await prisma.photo.create({
        data: { id: uuidv7(), stopId: stop.id, storageKey: 'k.jpg' },
      });

      await trash(trip.id).expect(204);
    });

    it('이미 휴지통에 있으면 404, 고치기도 404', async () => {
      const trip = await created();
      await trash(trip.id).expect(204);

      await trash(trip.id).expect(404);
      await api()
        .patch(`/v1/trips/${trip.id}`)
        .set('Authorization', bearer(me.token))
        .send({ title: 'x' })
        .expect(404);
    });

    it('다른 사람의 여행은 404이고 그대로다', async () => {
      const trip = await created();
      const other = await createUserWithToken(app);

      await trash(trip.id, other.token).expect(404);

      const row = await prisma.trip.findUniqueOrThrow({
        where: { id: trip.id },
      });
      expect(row.deletedAt).toBeNull();
    });
  });

  describe('소유자와 인증', () => {
    it.each([
      ['GET', ''],
      ['PATCH', ''],
      ['DELETE', ''],
    ])(
      '다른 사람의 여행에 %s → 404 (있는지도 알리지 않는다)',
      async (method) => {
        const trip = await created();
        const other = await createUserWithToken(app);

        await api()
          [method.toLowerCase() as 'get' | 'patch' | 'delete'](
            `/v1/trips/${trip.id}`,
          )
          .set('Authorization', bearer(other.token))
          .send(method === 'PATCH' ? { title: '남의 여행' } : undefined)
          .expect(404);

        const saved = await prisma.trip.findUniqueOrThrow({
          where: { id: trip.id },
        });
        expect(saved.title).toBe('부산 2박 3일 가을 여행');
      },
    );

    it('토큰이 없으면 모든 여행 경로가 401', async () => {
      const id = uuidv7();
      await api().get('/v1/trips').expect(401);
      await api().post('/v1/trips').send(newTrip()).expect(401);
      await api().get(`/v1/trips/${id}`).expect(401);
      await api().patch(`/v1/trips/${id}`).send({}).expect(401);
      await api().delete(`/v1/trips/${id}`).expect(401);
    });

    it('Swagger 문서에 여행 경로가 bearer 인증으로 있다', async () => {
      const response = await api().get('/docs-json').expect(200);
      const paths = response.body.paths;

      expect(Object.keys(paths)).toEqual(
        expect.arrayContaining(['/v1/trips', '/v1/trips/{tripId}']),
      );
      for (const operation of [
        paths['/v1/trips'].get,
        paths['/v1/trips'].post,
        paths['/v1/trips/{tripId}'].get,
        paths['/v1/trips/{tripId}'].patch,
        paths['/v1/trips/{tripId}'].delete,
      ]) {
        expect(operation.security).toEqual([{ bearer: [] }]);
      }
    });

    it('Swagger 예시 ID는 UUID v7이라 그대로 보내도 형식 검사를 통과한다', async () => {
      const response = await api().get('/docs-json').expect(200);
      const { paths, components } = response.body;
      const v7 =
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

      expect(components.schemas.CreateTripDto.properties.id.example).toMatch(
        v7,
      );
      for (const method of ['get', 'patch', 'delete']) {
        const tripId = paths['/v1/trips/{tripId}'][method].parameters.find(
          (parameter: { name: string }) => parameter.name === 'tripId',
        );
        // 경로 파라미터의 예시는 schema 안에 들어간다(Swagger 화면이 이 값으로 칸을 채운다).
        expect(tripId.schema.example).toMatch(v7);
      }
    });
  });
});
