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

const V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface StopBody {
  id: string;
  day: number;
  order: number;
  name: string;
  [field: string]: unknown;
}

interface Detail {
  trip: { id: string; updatedAt: string };
  stops: { id: string; day: number; order: number; [field: string]: unknown }[];
  segments: {
    id: string;
    fromStopId: string;
    toStopId: string;
    legs: unknown[];
  }[];
}

describe('장소 API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let me: { userId: string; token: string };
  /** 2박 3일 여행(1~3일차). */
  let tripId: string;

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
    tripId = await createTrip(me.token);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- 요청 도우미 ----

  const api = () => request(app.getHttpServer());

  async function createTrip(token: string): Promise<string> {
    const id = uuidv7();
    await api()
      .post('/v1/trips')
      .set('Authorization', bearer(token))
      .send({
        id,
        title: '부산 2박 3일 가을 여행',
        region: '부산',
        nights: 2,
        season: 'autumn',
      })
      .expect(201);
    return id;
  }

  function stopBody(
    name: string,
    day = 1,
    order = 99,
    fields: Record<string, unknown> = {},
  ): StopBody {
    return {
      id: uuidv7(),
      day,
      order,
      latitude: 35.1587,
      longitude: 129.1604,
      name,
      ...fields,
    };
  }

  function postStop(body: object, trip = tripId, token = me.token) {
    return api()
      .post(`/v1/trips/${trip}/stops`)
      .set('Authorization', bearer(token))
      .send(body);
  }

  /** 장소를 넣고 새 동선을 돌려준다. */
  async function add(body: StopBody): Promise<Detail> {
    return (await postStop(body).expect(201)).body as Detail;
  }

  /** 1일차에 이름 차례대로 장소를 넣고 ID를 돌려준다. */
  async function addAll(...names: string[]): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const name of names) {
      const body = stopBody(name);
      await add(body);
      ids[name] = body.id;
    }
    return ids;
  }

  async function detail(): Promise<Detail> {
    return (
      await api()
        .get(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(200)
    ).body as Detail;
  }

  /** 동선을 "일차: 장소 이름들"로 적는다. */
  function days(route: Detail): string[] {
    const byDay = new Map<number, string[]>();
    for (const stop of route.stops) {
      byDay.set(stop.day, [
        ...(byDay.get(stop.day) ?? []),
        stop.name as string,
      ]);
    }
    return [...byDay].map(([day, names]) => `${day}: ${names.join(' ')}`);
  }

  /** 구간을 "출발>도착" 이름으로 적는다. */
  function lines(route: Detail): string[] {
    const names = new Map(route.stops.map((s) => [s.id, s.name as string]));
    return route.segments.map(
      (s) => `${names.get(s.fromStopId)}>${names.get(s.toStopId)}`,
    );
  }

  function segmentBetween(route: Detail, from: string, to: string) {
    return route.segments.find(
      (s) => s.fromStopId === from && s.toStopId === to,
    );
  }

  describe('넣기', () => {
    it('첫 장소는 구간 없이 들어가고, 여행의 고친 시각이 바뀐다', async () => {
      const before = await detail();

      const route = await add(stopBody('해운대'));

      expect(days(route)).toEqual(['1: 해운대']);
      expect(route.segments).toEqual([]);
      expect(route.trip.updatedAt > before.trip.updatedAt).toBe(true);
    });

    it('넣은 장소를 앱 모델 모양으로 돌려준다 (선택 필드는 기본값)', async () => {
      const body = stopBody('해운대', 1, 0);

      const route = await add(body);

      expect(route.stops[0]).toEqual({
        id: body.id,
        tripId,
        day: 1,
        order: 0,
        latitude: 35.1587,
        longitude: 129.1604,
        name: '해운대',
        kind: 'other',
        description: '',
        memo: '',
        plannedTime: null,
        visited: false,
        visitedAt: null,
        timeZone: 'Asia/Seoul',
        placeProvider: null,
        placeId: null,
      });
    });

    it('A와 B 사이에 넣으면 A→B가 사라지고 A→X, X→B가 새로 생긴다. 새 구간 ID는 서버가 만든 v7이다', async () => {
      const { A, B } = await addAll('A', 'B');
      const ab = segmentBetween(await detail(), A, B)!;

      const route = await add(stopBody('X', 1, 1));

      expect(days(route)).toEqual(['1: A X B']);
      expect(route.stops.map((s) => s.order)).toEqual([0, 1, 2]);
      expect(lines(route)).toEqual(['A>X', 'X>B']);
      expect(route.segments.map((s) => s.id)).not.toContain(ab.id);
      for (const segment of route.segments) expect(segment.id).toMatch(V7);
    });

    it('이웃이 그대로인 구간은 ID와 이동 수단이 남는다', async () => {
      const { B, C } = await addAll('A', 'B', 'C');
      const bc = segmentBetween(await detail(), B, C)!;
      await prisma.segment.update({
        where: { id: bc.id },
        data: { legs: [{ mode: 'subway', stopCount: 2 }], curvature: 0.3 },
      });

      const route = await add(stopBody('X', 1, 1));

      expect(segmentBetween(route, B, C)).toMatchObject({
        id: bc.id,
        legs: [{ mode: 'subway', stopCount: 2 }],
      });
    });

    it('order가 크면 그 일차 맨 뒤, 빈 일차에도 넣고, 일차를 넘어 잇는다', async () => {
      await add(stopBody('A', 1, 0));
      await add(stopBody('C', 3, 0));
      await add(stopBody('B', 1, 99));
      const route = await add(stopBody('X', 2, 5));

      expect(days(route)).toEqual(['1: A B', '2: X', '3: C']);
      expect(lines(route)).toEqual(['A>B', 'B>X', 'X>C']);
    });

    it('같은 곳을 다른 ID로 여러 번 넣을 수 있다 (연박한 숙소)', async () => {
      const hotel = { kind: 'lodging', latitude: 35.16, longitude: 129.16 };
      await add(stopBody('호텔', 1, 0, hotel));
      await add(stopBody('광안리', 2, 0));
      const route = await add(stopBody('호텔', 2, 1, hotel));

      expect(days(route)).toEqual(['1: 호텔', '2: 광안리 호텔']);
      expect(lines(route)).toEqual(['호텔>광안리', '광안리>호텔']);
    });

    it('같은 ID로 다시 보내면 409이고 동선은 그대로다 (다른 사람의 장소 ID여도)', async () => {
      const body = stopBody('A');
      await add(body);

      await postStop({ ...body, name: '다시' }).expect(409);
      expect(days(await detail())).toEqual(['1: A']);

      const other = await createUserWithToken(app);
      const otherTrip = await createTrip(other.token);
      await postStop(
        stopBody('B', 1, 0, { id: body.id }),
        otherTrip,
        other.token,
      ).expect(409);
    });

    it.each([
      ['0일차', { day: 0 }],
      ['여행 일수(3일) 밖의 일차', { day: 4 }],
      ['음수 순서', { order: -1 }],
      ['위도 범위 밖', { latitude: 90.1 }],
      ['경도 범위 밖', { longitude: -180.1 }],
      ['빈 이름', { name: '  ' }],
      ['51자 이름', { name: '가'.repeat(51) }],
      ['1001자 설명', { description: '가'.repeat(1001) }],
      ['1001자 메모', { memo: '가'.repeat(1001) }],
      ['24:00 예정 시각', { plannedTime: '24:00' }],
      ['없는 시간대', { timeZone: 'Mars/Olympus' }],
      ['null 종류', { kind: null }],
      ['모르는 종류', { kind: 'cafe' }],
      ['placeProvider 없는 placeId', { placeId: 'p1' }],
      ['placeId 없는 placeProvider', { placeProvider: 'naver' }],
      ['UUID v4 ID', { id: randomUUID() }],
      ['방문 체크(1-4에서 받는다)', { visited: true }],
      ['모르는 필드', { color: 'red' }],
    ])('%s는 400', async (_, fields) => {
      await postStop({ ...stopBody('A', 1, 0), ...fields }).expect(400);
      expect((await detail()).stops).toEqual([]);
    });

    it('예정 시각·시간대·장소 서비스 ID를 함께 넣는다', async () => {
      const route = await add(
        stopBody('A', 1, 0, {
          kind: 'food',
          description: '설명',
          memo: '메모',
          plannedTime: '09:30',
          timeZone: 'Europe/Paris',
          placeProvider: 'naver',
          placeId: 'p1',
        }),
      );

      expect(route.stops[0]).toMatchObject({
        kind: 'food',
        description: '설명',
        memo: '메모',
        plannedTime: '09:30',
        timeZone: 'Europe/Paris',
        placeProvider: 'naver',
        placeId: 'p1',
      });
    });

    it('같은 여행에 동시에 넣어도 순서가 겹치지 않는다 (여행 줄 잠금)', async () => {
      await Promise.all(
        ['A', 'B', 'C', 'D', 'E'].map((name) =>
          postStop(stopBody(name, 1, 0)).expect(201),
        ),
      );

      const route = await detail();
      expect(route.stops.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
      expect(route.segments).toHaveLength(4);
    });
  });

  describe('고치기', () => {
    function patch(stopId: string, body: object, token = me.token) {
      return api()
        .patch(`/v1/stops/${stopId}`)
        .set('Authorization', bearer(token))
        .send(body);
    }

    it('보낸 필드만 바꾸고 장소를 돌려준다. 동선 자리는 그대로다', async () => {
      const { B } = await addAll('A', 'B');
      const before = await detail();

      const response = await patch(B, {
        name: '광안리',
        kind: 'tour',
        plannedTime: '18:00',
      }).expect(200);

      expect(response.body).toMatchObject({
        id: B,
        name: '광안리',
        kind: 'tour',
        plannedTime: '18:00',
        day: 1,
        order: 1,
        latitude: 35.1587,
      });
      const after = await detail();
      expect(after.segments).toEqual(before.segments);
      expect(after.trip.updatedAt > before.trip.updatedAt).toBe(true);
    });

    it('예정 시각·장소 서비스 ID는 null로 지운다', async () => {
      const body = stopBody('A', 1, 0, {
        plannedTime: '09:30',
        placeProvider: 'naver',
        placeId: 'p1',
      });
      await add(body);

      const response = await patch(body.id, {
        plannedTime: null,
        placeProvider: null,
        placeId: null,
      }).expect(200);

      expect(response.body).toMatchObject({
        plannedTime: null,
        placeProvider: null,
        placeId: null,
      });
    });

    it.each([
      ['일차', { day: 2 }],
      ['순서', { order: 0 }],
      ['null 이름', { name: null }],
      ['null 위도', { latitude: null }],
      ['빈 이름', { name: ' ' }],
      ['placeProvider 없는 placeId', { placeId: 'p1' }],
    ])('%s는 400', async (_, body) => {
      const { A } = await addAll('A');
      await patch(A, body).expect(400);
    });
  });

  describe('옮기기', () => {
    function move(
      stopId: string,
      day: number,
      order: number,
      token = me.token,
    ) {
      return api()
        .put(`/v1/stops/${stopId}/position`)
        .set('Authorization', bearer(token))
        .send({ day, order });
    }

    it('같은 일차 안에서, 다른 일차로 옮기고 구간을 다시 잇는다', async () => {
      const { A, C } = await addAll('A', 'B', 'C');

      let route = (await move(C, 1, 0).expect(200)).body as Detail;
      expect(days(route)).toEqual(['1: C A B']);

      route = (await move(A, 2, 9).expect(200)).body as Detail;
      expect(days(route)).toEqual(['1: C B', '2: A']);
      expect(route.stops.map((s) => s.order)).toEqual([0, 1, 0]);
      expect(lines(route)).toEqual(['C>B', 'B>A']);
    });

    it('제자리로 옮기면 구간이 바뀌지 않는다', async () => {
      const { B } = await addAll('A', 'B', 'C');
      const before = await detail();

      const route = (await move(B, 1, 1).expect(200)).body as Detail;

      expect(route.segments).toEqual(before.segments);
    });

    it('일차 범위 밖이나 모르는 필드는 400', async () => {
      const { A } = await addAll('A');
      await move(A, 4, 0).expect(400);
      await move(A, 0, 0).expect(400);
      await api()
        .put(`/v1/stops/${A}/position`)
        .set('Authorization', bearer(me.token))
        .send({ day: 1, order: 0, name: 'x' })
        .expect(400);
    });
  });

  describe('지우기', () => {
    function remove(stopId: string, token = me.token) {
      return api()
        .delete(`/v1/stops/${stopId}`)
        .set('Authorization', bearer(token));
    }

    it('가운데를 지우면 앞뒤를 새 구간으로 잇고 새 동선을 돌려준다', async () => {
      const { B } = await addAll('A', 'B', 'C');

      const route = (await remove(B).expect(200)).body as Detail;

      expect(days(route)).toEqual(['1: A C']);
      expect(route.stops.map((s) => s.order)).toEqual([0, 1]);
      expect(lines(route)).toEqual(['A>C']);
      await remove(B).expect(404);
    });

    it('사진이 달린 장소는 409 (사진·S3를 먼저 지우는 처리는 1-3에서)', async () => {
      const { A } = await addAll('A', 'B');
      await prisma.photo.create({
        data: { id: uuidv7(), stopId: A, storageKey: 'k.jpg' },
      });

      await remove(A).expect(409);
      expect(days(await detail())).toEqual(['1: A B']);
    });
  });

  describe('소유자와 인증', () => {
    it('다른 사람의 여행·장소에는 404 (있는지도 알리지 않는다)', async () => {
      const { A } = await addAll('A');
      const other = await createUserWithToken(app);
      const auth = bearer(other.token);

      await postStop(stopBody('X'), tripId, other.token).expect(404);
      await api()
        .patch(`/v1/stops/${A}`)
        .set('Authorization', auth)
        .send({ name: 'x' })
        .expect(404);
      await api()
        .put(`/v1/stops/${A}/position`)
        .set('Authorization', auth)
        .send({ day: 1, order: 0 })
        .expect(404);
      await api()
        .delete(`/v1/stops/${A}`)
        .set('Authorization', auth)
        .expect(404);

      expect(days(await detail())).toEqual(['1: A']);
    });

    it('UUID v7이 아닌 경로는 400', async () => {
      const response = await api()
        .patch(`/v1/stops/${randomUUID()}`)
        .set('Authorization', bearer(me.token))
        .send({ name: 'x' })
        .expect(400);
      expect(response.body.message).toBe(
        'stopId는 앱이 만든 UUID v7이어야 합니다',
      );
    });

    it('토큰이 없으면 모든 장소 경로가 401', async () => {
      const id = uuidv7();
      await api()
        .post(`/v1/trips/${tripId}/stops`)
        .send(stopBody('A'))
        .expect(401);
      await api().patch(`/v1/stops/${id}`).send({}).expect(401);
      await api().put(`/v1/stops/${id}/position`).send({}).expect(401);
      await api().delete(`/v1/stops/${id}`).expect(401);
    });

    it('Swagger 문서에 장소 경로가 bearer 인증과 v7 예시로 있다', async () => {
      const { paths, components } = (await api().get('/docs-json').expect(200))
        .body;
      const operations = [
        paths['/v1/trips/{tripId}/stops'].post,
        paths['/v1/stops/{stopId}'].patch,
        paths['/v1/stops/{stopId}/position'].put,
        paths['/v1/stops/{stopId}'].delete,
      ];

      for (const operation of operations) {
        expect(operation.security).toEqual([{ bearer: [] }]);
        for (const parameter of operation.parameters) {
          expect(parameter.schema.example).toMatch(V7);
        }
      }
      expect(components.schemas.CreateStopDto.properties.id.example).toMatch(
        V7,
      );
    });
  });
});
