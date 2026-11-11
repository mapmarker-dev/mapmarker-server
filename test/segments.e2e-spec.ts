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

interface Segment {
  id: string;
  tripId: string;
  fromStopId: string;
  toStopId: string;
  legs: unknown[];
  curvature: number;
  type: string;
}

describe('구간 API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let me: { userId: string; token: string };
  let tripId: string;
  /** 장소 A→B 사이의 구간. */
  let segment: Segment;

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
    tripId = uuidv7();
    await api()
      .post('/v1/trips')
      .set('Authorization', bearer(me.token))
      .send({
        id: tripId,
        title: '부산 당일치기 가을 여행',
        region: '부산',
        nights: 0,
        season: 'autumn',
      })
      .expect(201);
    for (const name of ['A', 'B']) {
      await api()
        .post(`/v1/trips/${tripId}/stops`)
        .set('Authorization', bearer(me.token))
        .send({
          id: uuidv7(),
          day: 1,
          order: 9,
          latitude: 35.1,
          longitude: 129.1,
          name,
        })
        .expect(201);
    }
    segment = (await detail()).segments[0];
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  async function detail(): Promise<{
    trip: { updatedAt: string };
    segments: Segment[];
  }> {
    return (
      await api()
        .get(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(200)
    ).body;
  }

  function patch(segmentId: string, body: object, token = me.token) {
    return api()
      .patch(`/v1/segments/${segmentId}`)
      .set('Authorization', bearer(token))
      .send(body);
  }

  it('이동 수단·곡률·종류를 바꾸고 같은 ID의 구간을 돌려준다', async () => {
    const before = await detail();
    const legs = [
      { mode: 'subway', stopCount: 2, durationMinutes: 12 },
      { mode: 'walk', durationMinutes: 5 },
    ];

    const response = await patch(segment.id, {
      legs,
      curvature: -0.4,
      type: 'normal',
    }).expect(200);

    expect(response.body).toEqual({
      ...segment,
      legs,
      curvature: -0.4,
      type: 'normal',
    });
    const after = await detail();
    expect(after.segments).toEqual([response.body]);
    expect(after.trip.updatedAt > before.trip.updatedAt).toBe(true);
  });

  it('보낸 필드만 바꾸고, legs: []는 이동 수단을 미정으로 되돌린다', async () => {
    await patch(segment.id, { legs: [{ mode: 'bus', stopCount: 3 }] }).expect(
      200,
    );

    const curved = await patch(segment.id, { curvature: 0.5 }).expect(200);
    expect(curved.body).toMatchObject({
      legs: [{ mode: 'bus', stopCount: 3 }],
      curvature: 0.5,
    });

    const cleared = await patch(segment.id, { legs: [] }).expect(200);
    expect(cleared.body).toMatchObject({ legs: [], curvature: 0.5 });
  });

  it.each([
    ['6토막', { legs: Array(6).fill({ mode: 'walk' }) }],
    ['도보의 정류장 수', { legs: [{ mode: 'walk', stopCount: 2 }] }],
    ['정류장 수 100', { legs: [{ mode: 'subway', stopCount: 100 }] }],
    ['걸리는 시간 0분', { legs: [{ mode: 'car', durationMinutes: 0 }] }],
    ['모르는 수단', { legs: [{ mode: 'bike' }] }],
    ['토막 안의 모르는 필드', { legs: [{ mode: 'walk', minutes: 5 }] }],
    ['null 이동 수단', { legs: null }],
    ['곡률 1.1', { curvature: 1.1 }],
    ['모르는 종류', { type: 'curve' }],
    ['잇는 장소 바꾸기', { toStopId: uuidv7() }],
  ])('%s는 400이고 구간은 그대로다', async (_, body) => {
    await patch(segment.id, body).expect(400);
    expect((await detail()).segments).toEqual([segment]);
  });

  it('다른 사람의 구간과 없는 구간은 404', async () => {
    const other = await createUserWithToken(app);

    await patch(segment.id, { curvature: 0.5 }, other.token).expect(404);
    await patch(uuidv7(), { curvature: 0.5 }).expect(404);
    expect((await detail()).segments).toEqual([segment]);
  });

  it('휴지통에 든 여행의 구간은 404이고 그대로다', async () => {
    await api()
      .delete(`/v1/trips/${tripId}`)
      .set('Authorization', bearer(me.token))
      .expect(204);

    await patch(segment.id, { curvature: 0.5 }).expect(404);
    const row = await prisma.segment.findUniqueOrThrow({
      where: { id: segment.id },
    });
    expect(row.curvature).toBe(segment.curvature);
  });

  it('UUID v7이 아닌 경로는 400, 토큰이 없으면 401', async () => {
    const response = await patch(randomUUID(), { curvature: 0 }).expect(400);
    expect(response.body.message).toBe(
      'segmentId는 앱이 만든 UUID v7이어야 합니다',
    );
    await api()
      .patch(`/v1/segments/${segment.id}`)
      .send({ curvature: 0 })
      .expect(401);
  });

  it('Swagger 문서에 구간 경로가 bearer 인증과 v7 예시로 있다', async () => {
    const { paths } = (await api().get('/docs-json').expect(200)).body;
    const operation = paths['/v1/segments/{segmentId}'].patch;

    expect(operation.security).toEqual([{ bearer: [] }]);
    expect(operation.parameters[0].schema.example).toMatch(V7);
  });
});
