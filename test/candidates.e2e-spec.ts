import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { TrashService } from '../src/trips/trash.service';
import { bearer, createUserWithToken } from './setup/auth';
import { truncateAll } from './setup/database';
import { uuidv7 } from './setup/ids';

const DAY_MS = 24 * 60 * 60 * 1000;

interface CandidateBody {
  id: string;
  name: string;
  [field: string]: unknown;
}

interface Detail {
  trip: { id: string; updatedAt: string };
  stops: { id: string }[];
  segments: unknown[];
  candidates: { id: string; name: string; [field: string]: unknown }[];
}

describe('후보 API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let me: { userId: string; token: string };
  /** 2박 3일 여행. */
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
        title: '제주 2박 3일 가을 여행',
        region: '제주',
        nights: 2,
        season: 'autumn',
      })
      .expect(201);
    return id;
  }

  function candidateBody(
    name: string,
    fields: Record<string, unknown> = {},
  ): CandidateBody {
    return {
      id: uuidv7(),
      latitude: 33.5065,
      longitude: 126.9535,
      name,
      ...fields,
    };
  }

  function postCandidate(body: object, trip = tripId, token = me.token) {
    return api()
      .post(`/v1/trips/${trip}/candidates`)
      .set('Authorization', bearer(token))
      .send(body);
  }

  function patchCandidate(id: string, body: object, token = me.token) {
    return api()
      .patch(`/v1/candidates/${id}`)
      .set('Authorization', bearer(token))
      .send(body);
  }

  function deleteCandidate(id: string, token = me.token) {
    return api()
      .delete(`/v1/candidates/${id}`)
      .set('Authorization', bearer(token));
  }

  /** 이름 차례대로 후보를 넣고 ID를 돌려준다. */
  async function addAll(...names: string[]): Promise<Record<string, string>> {
    const ids: Record<string, string> = {};
    for (const name of names) {
      const body = candidateBody(name);
      await postCandidate(body).expect(201);
      ids[name] = body.id;
    }
    return ids;
  }

  async function detail(trip = tripId): Promise<Detail> {
    return (
      await api()
        .get(`/v1/trips/${trip}`)
        .set('Authorization', bearer(me.token))
        .expect(200)
    ).body as Detail;
  }

  async function candidateNames(trip = tripId): Promise<string[]> {
    return (await detail(trip)).candidates.map((c) => c.name);
  }

  function trash(trip = tripId) {
    return api()
      .delete(`/v1/trips/${trip}`)
      .set('Authorization', bearer(me.token))
      .expect(204);
  }

  describe('넣기', () => {
    it('후보를 돌려주고, 기본값은 기타·빈 설명·메모·장소 서비스 없음이다', async () => {
      const body = candidateBody('우도');

      const response = await postCandidate(body).expect(201);

      expect(response.body).toEqual({
        id: body.id,
        tripId,
        latitude: 33.5065,
        longitude: 126.9535,
        name: '우도',
        kind: 'other',
        description: '',
        memo: '',
        placeProvider: null,
        placeId: null,
      });
    });

    it('종류·설명·메모·장소 서비스 ID를 함께 넣는다', async () => {
      const body = candidateBody('카페', {
        kind: 'food',
        description: '바다 앞',
        memo: '오후에',
        placeProvider: 'naver',
        placeId: '12345',
      });

      const response = await postCandidate(body).expect(201);

      expect(response.body).toMatchObject({
        kind: 'food',
        description: '바다 앞',
        memo: '오후에',
        placeProvider: 'naver',
        placeId: '12345',
      });
    });

    it('여행을 읽으면 넣은 순서로 후보가 오고, 장소·구간에는 들지 않는다', async () => {
      await addAll('우도', '비자림', '카페');

      const body = await detail();

      expect(body.candidates.map((c) => c.name)).toEqual([
        '우도',
        '비자림',
        '카페',
      ]);
      expect(body.stops).toEqual([]);
      expect(body.segments).toEqual([]);
    });

    it('후보가 없으면 빈 배열이다', async () => {
      expect((await detail()).candidates).toEqual([]);
    });

    it('여행의 고친 시각이 바뀐다(목록이 최근에 고친 순서)', async () => {
      const before = (await detail()).trip.updatedAt;

      await postCandidate(candidateBody('우도')).expect(201);

      expect((await detail()).trip.updatedAt > before).toBe(true);
    });

    it.each([
      ['이름이 빔', { name: '  ' }],
      ['이름이 50자를 넘음', { name: '가'.repeat(51) }],
      ['설명이 1000자를 넘음', { description: '가'.repeat(1001) }],
      ['좌표가 범위 밖', { latitude: 91 }],
      ['모르는 종류', { kind: 'airport' }],
      ['일차를 보냄', { day: 1 }],
      ['ID가 UUID v7이 아님', { id: 'not-a-uuid' }],
      ['장소 서비스 ID만 있음', { placeId: '12345' }],
      ['장소 서비스만 있음', { placeProvider: 'naver' }],
    ])('입력이 틀리면 400: %s', async (_, fields) => {
      await postCandidate(candidateBody('우도', fields)).expect(400);
      expect(await prisma.candidate.count()).toBe(0);
    });

    it('같은 ID의 후보가 있으면 409', async () => {
      const body = candidateBody('우도');
      await postCandidate(body).expect(201);

      await postCandidate({ ...body, name: '다시' }).expect(409);

      expect(await candidateNames()).toEqual(['우도']);
    });

    it('같은 ID의 장소가 있으면 409', async () => {
      const id = uuidv7();
      await api()
        .post(`/v1/trips/${tripId}/stops`)
        .set('Authorization', bearer(me.token))
        .send({
          id,
          day: 1,
          order: 0,
          latitude: 33.5,
          longitude: 126.5,
          name: '공항',
        })
        .expect(201);

      await postCandidate(candidateBody('우도', { id })).expect(409);

      expect(await prisma.candidate.count()).toBe(0);
    });

    it('반대로, 같은 ID의 후보가 있으면 장소 넣기가 409', async () => {
      const body = candidateBody('우도');
      await postCandidate(body).expect(201);

      await api()
        .post(`/v1/trips/${tripId}/stops`)
        .set('Authorization', bearer(me.token))
        .send({
          id: body.id,
          day: 1,
          order: 0,
          latitude: 33.5,
          longitude: 126.5,
          name: '우도',
        })
        .expect(409);

      expect(await prisma.stop.count()).toBe(0);
    });

    it('없는 여행, 남의 여행은 404', async () => {
      const other = await createUserWithToken(app);
      const othersTrip = await createTrip(other.token);

      await postCandidate(candidateBody('우도'), uuidv7()).expect(404);
      await postCandidate(candidateBody('우도'), othersTrip).expect(404);

      expect(await prisma.candidate.count()).toBe(0);
    });
  });

  describe('고치기', () => {
    it('보낸 필드만 바꾸고 후보를 돌려준다', async () => {
      const body = candidateBody('우도', { description: '섬', memo: '배' });
      await postCandidate(body).expect(201);

      const response = await patchCandidate(body.id, {
        name: '우도 (배)',
        kind: 'tour',
      }).expect(200);

      expect(response.body).toMatchObject({
        id: body.id,
        name: '우도 (배)',
        kind: 'tour',
        description: '섬',
        memo: '배',
      });
    });

    it('장소 서비스 ID는 null로 둘 다 지운다', async () => {
      const body = candidateBody('우도', {
        placeProvider: 'naver',
        placeId: '12345',
      });
      await postCandidate(body).expect(201);

      const response = await patchCandidate(body.id, {
        placeProvider: null,
        placeId: null,
      }).expect(200);

      expect(response.body).toMatchObject({
        placeProvider: null,
        placeId: null,
      });
    });

    it('장소 서비스 ID를 하나만 지우거나, 지울 수 없는 필드를 null로 보내면 400', async () => {
      const body = candidateBody('우도', {
        placeProvider: 'naver',
        placeId: '12345',
      });
      await postCandidate(body).expect(201);

      await patchCandidate(body.id, { placeId: null }).expect(400);
      await patchCandidate(body.id, { name: null }).expect(400);
      await patchCandidate(body.id, { kind: null }).expect(400);
    });

    it('넣은 순서는 그대로다', async () => {
      const ids = await addAll('우도', '비자림');

      await patchCandidate(ids['우도'], { name: '우도 (고침)' }).expect(200);

      expect(await candidateNames()).toEqual(['우도 (고침)', '비자림']);
    });

    it('없는 후보, 남의 후보는 404', async () => {
      const other = await createUserWithToken(app);
      const othersTrip = await createTrip(other.token);
      const body = candidateBody('남의 후보');
      await postCandidate(body, othersTrip, other.token).expect(201);

      await patchCandidate(uuidv7(), { name: '고침' }).expect(404);
      await patchCandidate(body.id, { name: '고침' }).expect(404);
    });
  });

  describe('지우기', () => {
    it('204, 목록에서 빠지고 다시 지우면 404', async () => {
      const ids = await addAll('우도', '비자림');

      await deleteCandidate(ids['우도']).expect(204);

      expect(await candidateNames()).toEqual(['비자림']);
      await deleteCandidate(ids['우도']).expect(404);
    });

    it('남의 후보는 404이고 그대로다', async () => {
      const other = await createUserWithToken(app);
      const othersTrip = await createTrip(other.token);
      const body = candidateBody('남의 후보');
      await postCandidate(body, othersTrip, other.token).expect(201);

      await deleteCandidate(body.id).expect(404);

      expect(await prisma.candidate.count()).toBe(1);
    });
  });

  describe('휴지통', () => {
    it('휴지통의 여행이면 후보 넣기·고치기·지우기가 404이고 그대로다', async () => {
      const ids = await addAll('우도');
      await trash();

      await postCandidate(candidateBody('비자림')).expect(404);
      await patchCandidate(ids['우도'], { name: '고침' }).expect(404);
      await deleteCandidate(ids['우도']).expect(404);

      const saved = await prisma.candidate.findMany();
      expect(saved.map((c) => c.name)).toEqual(['우도']);
    });

    it('되살리면 후보도 그대로 돌아온다', async () => {
      await addAll('우도', '비자림');
      await trash();

      await api()
        .post(`/v1/trash/${tripId}/restore`)
        .set('Authorization', bearer(me.token))
        .expect(200);

      expect(await candidateNames()).toEqual(['우도', '비자림']);
    });

    it('영구 삭제하면 후보도 함께 지워진다', async () => {
      await addAll('우도');
      await trash();

      await api()
        .delete(`/v1/trash/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(204);

      expect(await prisma.candidate.count()).toBe(0);
    });

    it('예약 삭제도 후보를 함께 지운다', async () => {
      await addAll('우도');
      await trash();
      await prisma.trip.update({
        where: { id: tripId },
        data: { deletedAt: new Date(Date.now() - 31 * DAY_MS) },
      });

      expect(await app.get(TrashService).purgeExpired()).toBe(1);

      expect(await prisma.candidate.count()).toBe(0);
    });
  });

  describe('인증과 문서', () => {
    it('토큰이 없으면 모든 후보 경로가 401', async () => {
      const id = uuidv7();
      await api()
        .post(`/v1/trips/${tripId}/candidates`)
        .send(candidateBody('우도'))
        .expect(401);
      await api().patch(`/v1/candidates/${id}`).send({}).expect(401);
      await api().delete(`/v1/candidates/${id}`).expect(401);
    });

    it('UUID v7이 아닌 경로는 400', async () => {
      await patchCandidate('not-a-uuid', { name: '고침' }).expect(400);
      await deleteCandidate('not-a-uuid').expect(400);
    });

    it('Swagger 문서에 후보 경로가 bearer 인증으로 있고, 여행 응답에 후보가 있다', async () => {
      const response = await api().get('/docs-json').expect(200);
      const { paths, components } = response.body;

      for (const operation of [
        paths['/v1/trips/{tripId}/candidates'].post,
        paths['/v1/candidates/{candidateId}'].patch,
        paths['/v1/candidates/{candidateId}'].delete,
      ]) {
        expect(operation.security).toEqual([{ bearer: [] }]);
      }
      expect(
        Object.keys(components.schemas.TripDetailResponse.properties),
      ).toEqual(['trip', 'stops', 'segments', 'candidates']);
    });
  });
});
