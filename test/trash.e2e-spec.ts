import { INestApplication } from '@nestjs/common';
import { CronExpression, SchedulerRegistry } from '@nestjs/schedule';
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

describe('휴지통 API (e2e)', () => {
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

  /** 여행을 만들고 ID를 돌려준다. */
  async function createTrip(title = '부산 여행', token = me.token) {
    const id = uuidv7();
    await api()
      .post('/v1/trips')
      .set('Authorization', bearer(token))
      .send({ id, title, region: '부산', nights: 0, season: 'autumn' })
      .expect(201);
    return id;
  }

  function trash(tripId: string, token = me.token) {
    return api()
      .delete(`/v1/trips/${tripId}`)
      .set('Authorization', bearer(token))
      .expect(204);
  }

  /** 휴지통에 넣은 시각을 바꾼다(보관 기간 확인용). */
  async function setDeletedAt(tripId: string, deletedAt: Date) {
    await prisma.trip.update({ where: { id: tripId }, data: { deletedAt } });
  }

  function list(token = me.token) {
    return api().get('/v1/trash').set('Authorization', bearer(token));
  }

  function restore(tripId: string, token = me.token) {
    return api()
      .post(`/v1/trash/${tripId}/restore`)
      .set('Authorization', bearer(token));
  }

  function removeForever(tripId: string, token = me.token) {
    return api()
      .delete(`/v1/trash/${tripId}`)
      .set('Authorization', bearer(token));
  }

  async function tripIds(token = me.token): Promise<string[]> {
    const response = await api()
      .get('/v1/trips')
      .set('Authorization', bearer(token))
      .expect(200);
    return response.body.map((trip: { id: string }) => trip.id);
  }

  describe('목록', () => {
    it('휴지통의 내 여행만, 최근에 지운 순서로, 지울 시각(30일 뒤)과 함께 돌려준다', async () => {
      const older = await createTrip('먼저 지운 여행');
      const newer = await createTrip('나중에 지운 여행');
      const kept = await createTrip('남긴 여행');
      const others = await createUserWithToken(app);
      await trash(await createTrip('남의 여행', others.token), others.token);
      await trash(older);
      await trash(newer);
      await setDeletedAt(older, new Date('2026-11-01T00:00:00.000Z'));
      await setDeletedAt(newer, new Date('2026-11-05T12:00:00.000Z'));

      const response = await list().expect(200);

      expect(response.body.map((t: { title: string }) => t.title)).toEqual([
        '나중에 지운 여행',
        '먼저 지운 여행',
      ]);
      expect(response.body[0]).toMatchObject({
        id: newer,
        region: '부산',
        deletedAt: '2026-11-05T12:00:00.000Z',
        purgeAt: '2026-12-05T12:00:00.000Z',
      });
      expect(response.body.map((t: { id: string }) => t.id)).not.toContain(
        kept,
      );
    });

    it('보관 기간이 끝난 여행은 예약 삭제 전이어도 빠진다', async () => {
      const expired = await createTrip();
      const fresh = await createTrip();
      await trash(expired);
      await trash(fresh);
      await setDeletedAt(expired, new Date(Date.now() - 30 * DAY_MS - 1000));
      await setDeletedAt(fresh, new Date(Date.now() - 29 * DAY_MS));

      const response = await list().expect(200);

      expect(response.body.map((t: { id: string }) => t.id)).toEqual([fresh]);
    });

    it('비었으면 빈 배열', async () => {
      await createTrip();
      expect((await list().expect(200)).body).toEqual([]);
    });
  });

  describe('되살리기', () => {
    it('여행을 돌려주고 원래 자리(고친 시각 그대로)로 목록에 돌아간다', async () => {
      const first = await createTrip('처음 여행');
      const second = await createTrip('두 번째 여행');
      const before = await prisma.trip.findUniqueOrThrow({
        where: { id: first },
      });
      await trash(first);

      const response = await restore(first).expect(200);

      expect(response.body).toMatchObject({
        id: first,
        title: '처음 여행',
        updatedAt: before.updatedAt.toISOString(),
      });
      expect(response.body).not.toHaveProperty('deletedAt');
      expect(await tripIds()).toEqual([second, first]);
      expect((await list().expect(200)).body).toEqual([]);
    });

    it('되살린 여행은 장소·구간까지 다시 보이고 고칠 수 있다', async () => {
      const tripId = await createTrip();
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
      await trash(tripId);
      await restore(tripId).expect(200);

      const detail = await api()
        .get(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(200);
      expect(detail.body.stops).toHaveLength(2);
      expect(detail.body.segments).toHaveLength(1);
      await api()
        .patch(`/v1/segments/${detail.body.segments[0].id}`)
        .set('Authorization', bearer(me.token))
        .send({ curvature: 0.3 })
        .expect(200);
    });

    it('휴지통에 없는 여행, 보관 기간이 끝난 여행, 남의 여행은 404', async () => {
      const active = await createTrip();
      const expired = await createTrip();
      await trash(expired);
      await setDeletedAt(expired, new Date(Date.now() - 31 * DAY_MS));
      const others = await createUserWithToken(app);
      const theirs = await createTrip('남의 여행', others.token);
      await trash(theirs, others.token);

      await restore(active).expect(404);
      await restore(expired).expect(404);
      await restore(theirs).expect(404);
      await restore(uuidv7()).expect(404);
      expect(await tripIds(others.token)).toEqual([]);
    });
  });

  describe('영구 삭제', () => {
    it('여행과 장소·구간을 지우고 204, 다시 부르면 404', async () => {
      const tripId = await createTrip();
      const stops = [uuidv7(), uuidv7()];
      for (const id of stops) {
        await api()
          .post(`/v1/trips/${tripId}/stops`)
          .set('Authorization', bearer(me.token))
          .send({
            id,
            day: 1,
            order: 9,
            latitude: 35.1,
            longitude: 129.1,
            name: id,
          })
          .expect(201);
      }
      await trash(tripId);

      await removeForever(tripId).expect(204);

      expect(await prisma.trip.count()).toBe(0);
      expect(await prisma.stop.count()).toBe(0);
      expect(await prisma.segment.count()).toBe(0);
      await removeForever(tripId).expect(404);
    });

    it('휴지통에 없는 여행, 보관 기간이 끝난 여행, 남의 여행은 404이고 그대로다', async () => {
      const active = await createTrip();
      const expired = await createTrip();
      await trash(expired);
      await setDeletedAt(expired, new Date(Date.now() - 31 * DAY_MS));
      const others = await createUserWithToken(app);
      const theirs = await createTrip('남의 여행', others.token);
      await trash(theirs, others.token);

      await removeForever(active).expect(404);
      await removeForever(expired).expect(404);
      await removeForever(theirs).expect(404);
      expect(await prisma.trip.count()).toBe(3);
    });

    it('사진이 달린 장소가 있으면 409 (사진·S3를 먼저 지우는 처리는 1-3에서)', async () => {
      const tripId = await createTrip();
      const stopId = uuidv7();
      await api()
        .post(`/v1/trips/${tripId}/stops`)
        .set('Authorization', bearer(me.token))
        .send({
          id: stopId,
          day: 1,
          order: 0,
          latitude: 35.1,
          longitude: 129.1,
          name: 'A',
        })
        .expect(201);
      await prisma.photo.create({
        data: { id: uuidv7(), stopId, storageKey: 'k.jpg' },
      });
      await trash(tripId);

      await removeForever(tripId).expect(409);
    });
  });

  describe('예약 삭제', () => {
    const now = new Date('2026-12-10T09:00:00.000Z');

    async function stopCount(tripId: string) {
      return prisma.stop.count({ where: { tripId } });
    }

    it('넣은 지 30일이 지난 여행을 장소·구간과 함께 지우고 지운 수를 돌려준다', async () => {
      const ids: Record<string, string> = {};
      for (const [name, deletedAt] of [
        ['31일', new Date(now.getTime() - 31 * DAY_MS)],
        ['딱 30일', new Date(now.getTime() - 30 * DAY_MS)],
        ['29일', new Date(now.getTime() - 29 * DAY_MS)],
      ] as const) {
        ids[name] = await createTrip(name);
        for (const stop of ['A', 'B']) {
          await api()
            .post(`/v1/trips/${ids[name]}/stops`)
            .set('Authorization', bearer(me.token))
            .send({
              id: uuidv7(),
              day: 1,
              order: 9,
              latitude: 35.1,
              longitude: 129.1,
              name: stop,
            })
            .expect(201);
        }
        await trash(ids[name]);
        await setDeletedAt(ids[name], deletedAt);
      }
      const active = await createTrip('휴지통에 없는 여행');
      // 오래 고치지 않은 여행도 휴지통에 없으면 지우지 않는다.
      await prisma.$executeRaw`
        UPDATE trips SET updated_at = ${new Date(now.getTime() - 400 * DAY_MS)}
        WHERE id = ${active}::uuid`;

      const purged = await app.get(TrashService).purgeExpired(now);

      expect(purged).toBe(2);
      const left = await prisma.trip.findMany({ select: { title: true } });
      expect(left.map((t) => t.title).sort()).toEqual(
        ['29일', '휴지통에 없는 여행'].sort(),
      );
      expect(await stopCount(ids['31일'])).toBe(0);
      expect(await stopCount(ids['딱 30일'])).toBe(0);
      expect(await stopCount(ids['29일'])).toBe(2);
      expect(await prisma.segment.count()).toBe(1);
    });

    it('방금 넣은 여행만 있으면 지우지 않고 0', async () => {
      await trash(await createTrip());
      expect(await app.get(TrashService).purgeExpired()).toBe(0);
      expect(await prisma.trip.count()).toBe(1);
    });

    it('한 시간마다 도는 작업으로 등록돼 있다', () => {
      const job = app.get(SchedulerRegistry).getCronJob('trash-purge');
      expect(job.cronTime.source).toBe(CronExpression.EVERY_HOUR);
    });
  });

  describe('인증과 문서', () => {
    it('토큰이 없으면 모든 휴지통 경로가 401', async () => {
      const tripId = uuidv7();
      await api().get('/v1/trash').expect(401);
      await api().post(`/v1/trash/${tripId}/restore`).expect(401);
      await api().delete(`/v1/trash/${tripId}`).expect(401);
    });

    it('UUID v7이 아닌 경로는 400', async () => {
      await restore('not-a-uuid').expect(400);
      await removeForever('not-a-uuid').expect(400);
    });

    it('Swagger 문서에 휴지통 경로가 bearer 인증으로 있다', async () => {
      const response = await api().get('/docs-json').expect(200);
      const { paths, components } = response.body;

      for (const operation of [
        paths['/v1/trash'].get,
        paths['/v1/trash/{tripId}/restore'].post,
        paths['/v1/trash/{tripId}'].delete,
      ]) {
        expect(operation.security).toEqual([{ bearer: [] }]);
      }
      expect(
        Object.keys(components.schemas.TrashedTripResponse.properties),
      ).toEqual(
        expect.arrayContaining(['id', 'title', 'deletedAt', 'purgeAt']),
      );
    });
  });
});
