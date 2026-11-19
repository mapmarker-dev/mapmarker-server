import { INestApplication, Logger } from '@nestjs/common';
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
import { FakePhotoStorage, withFakePhotoStorage } from './setup/photo-storage';

interface Photo {
  id: string;
  url: string;
  thumbnailUrl: string;
}

interface Detail {
  trip: { id: string; updatedAt: string };
  stops: { id: string; name: string; photo: Photo | null }[];
  candidates: { id: string }[];
}

interface Upload {
  photoId: string;
  original: { url: string; headers: Record<string, string> };
  thumbnail: { url: string; headers: Record<string, string> };
  expiresAt: string;
}

describe('사진 API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let storage: FakePhotoStorage;
  let me: { userId: string; token: string };
  let tripId: string;

  beforeAll(async () => {
    storage = new FakePhotoStorage();
    const moduleRef = await withFakePhotoStorage(
      Test.createTestingModule({ imports: [AppModule] }),
      storage,
    ).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    storage.files.clear();
    storage.uploads.length = 0;
    storage.down = false;
    me = await createUserWithToken(app);
    tripId = await createTrip();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- 요청 도우미 ----

  const api = () => request(app.getHttpServer());

  async function createTrip(token = me.token): Promise<string> {
    const id = uuidv7();
    await api()
      .post('/v1/trips')
      .set('Authorization', bearer(token))
      .send({ id, title: '부산', region: '부산', nights: 1, season: 'autumn' })
      .expect(201);
    return id;
  }

  async function addStop(name: string, trip = tripId): Promise<string> {
    const id = uuidv7();
    await api()
      .post(`/v1/trips/${trip}/stops`)
      .set('Authorization', bearer(me.token))
      .send({ id, day: 1, order: 99, latitude: 35.1, longitude: 129.1, name })
      .expect(201);
    return id;
  }

  function requestUpload(
    stopId: string,
    body: object = { photoId: uuidv7(), size: 300_000, thumbnailSize: 30_000 },
    token = me.token,
  ) {
    return api()
      .post(`/v1/stops/${stopId}/photo-uploads`)
      .set('Authorization', bearer(token))
      .send(body);
  }

  function register(stopId: string, id: string, token = me.token) {
    return api()
      .put(`/v1/stops/${stopId}/photo`)
      .set('Authorization', bearer(token))
      .send({ id });
  }

  function removePhoto(stopId: string, token = me.token) {
    return api()
      .delete(`/v1/stops/${stopId}/photo`)
      .set('Authorization', bearer(token));
  }

  async function detail(): Promise<Detail> {
    return (
      await api()
        .get(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(200)
    ).body as Detail;
  }

  function keyOf(photoId: string, trip = tripId) {
    return `users/${me.userId}/trips/${trip}/photos/${photoId}.jpg`;
  }

  function thumbKeyOf(photoId: string, trip = tripId) {
    return `users/${me.userId}/trips/${trip}/photos/${photoId}_thumb.jpg`;
  }

  /** 업로드 주소를 받고 두 파일을 올린 뒤 등록한다. 사진 ID를 돌려준다. [trip]은 장소의 여행이다. */
  async function attach(stopId: string, trip = tripId): Promise<string> {
    const photoId = uuidv7();
    await requestUpload(stopId, {
      photoId,
      size: 300_000,
      thumbnailSize: 30_000,
    }).expect(201);
    storage.upload(keyOf(photoId, trip), 300_000);
    storage.upload(thumbKeyOf(photoId, trip), 30_000);
    await register(stopId, photoId).expect(200);
    return photoId;
  }

  describe('업로드 주소', () => {
    it('원본과 썸네일 주소를 사용자, 여행, 사진 ID 경로로 10분짜리로 준다', async () => {
      const stopId = await addStop('해운대');
      const photoId = uuidv7();

      const body = (
        await requestUpload(stopId, {
          photoId,
          size: 300_000,
          thumbnailSize: 30_000,
        }).expect(201)
      ).body as Upload;

      expect(body.photoId).toBe(photoId);
      expect(body.original.url).toBe(
        `fake-s3://${keyOf(photoId)}?put&expires=600`,
      );
      expect(body.thumbnail.url).toBe(
        `fake-s3://${thumbKeyOf(photoId)}?put&expires=600`,
      );
      expect(body.original.headers).toEqual({
        'Content-Type': 'image/jpeg',
        'Content-Length': '300000',
        'x-amz-tagging': 'upload=pending',
      });
      expect(body.thumbnail.headers['Content-Length']).toBe('30000');
      const expiresIn = new Date(body.expiresAt).getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(9 * 60 * 1000);
      expect(expiresIn).toBeLessThanOrEqual(10 * 60 * 1000);
      // 주소만 주고 DB에는 쓰지 않는다.
      expect(await prisma.photo.count()).toBe(0);
    });

    it('크기가 0이거나 상한(원본 5MB, 썸네일 512KB)을 넘거나 ID가 v7이 아니면 400', async () => {
      const stopId = await addStop('해운대');
      const body = { photoId: uuidv7(), size: 1, thumbnailSize: 1 };

      await requestUpload(stopId, { ...body, size: 0 }).expect(400);
      await requestUpload(stopId, {
        ...body,
        size: 5 * 1024 * 1024 + 1,
      }).expect(400);
      await requestUpload(stopId, {
        ...body,
        thumbnailSize: 512 * 1024 + 1,
      }).expect(400);
      await requestUpload(stopId, {
        ...body,
        photoId: '8f14e45f-ceea-4e6f-a1a3-2b9a5c1d0e7f',
      }).expect(400);
      await requestUpload(stopId, { ...body, extra: 1 }).expect(400);
      await requestUpload(stopId, {
        size: 5 * 1024 * 1024,
        thumbnailSize: 512 * 1024,
        photoId: uuidv7(),
      }).expect(201);
    });

    it('이미 등록된 사진 ID면 409 (같은 키에 올리면 등록된 파일을 덮어쓴다)', async () => {
      const stopId = await addStop('해운대');
      const photoId = await attach(stopId);

      await requestUpload(stopId, {
        photoId,
        size: 1,
        thumbnailSize: 1,
      }).expect(409);
    });

    it('없는 장소, 남의 장소, 휴지통 여행의 장소는 404', async () => {
      const stopId = await addStop('해운대');
      const other = await createUserWithToken(app);

      await requestUpload(uuidv7()).expect(404);
      await requestUpload(stopId, undefined, other.token).expect(404);

      await api()
        .delete(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(204);
      await requestUpload(stopId).expect(404);
      expect(storage.uploads).toEqual([]);
    });
  });

  describe('등록', () => {
    it('올린 두 파일의 등록 전 태그를 떼고 사진이 든 장소를 돌려준다', async () => {
      const stopId = await addStop('해운대');
      const photoId = uuidv7();
      await requestUpload(stopId, {
        photoId,
        size: 300_000,
        thumbnailSize: 30_000,
      }).expect(201);
      storage.upload(keyOf(photoId), 300_000);
      storage.upload(thumbKeyOf(photoId), 30_000);

      const stop = (await register(stopId, photoId).expect(200)).body as {
        id: string;
        photo: Photo;
      };

      expect(stop.id).toBe(stopId);
      expect(stop.photo).toEqual({
        id: photoId,
        url: `fake-s3://${keyOf(photoId)}?get&expires=3600`,
        thumbnailUrl: `fake-s3://${thumbKeyOf(photoId)}?get&expires=3600`,
      });
      expect(storage.files.get(keyOf(photoId))?.pending).toBe(false);
      expect(storage.files.get(thumbKeyOf(photoId))?.pending).toBe(false);
      const row = await prisma.photo.findUniqueOrThrow({
        where: { id: photoId },
      });
      expect(row).toMatchObject({ stopId, storageKey: keyOf(photoId) });
    });

    it('여행 응답의 장소에 사진 주소가 오고, 사진이 없는 장소는 null', async () => {
      const withPhoto = await addStop('해운대');
      const without = await addStop('광안리');
      const photoId = await attach(withPhoto);

      const body = await detail();

      expect(body.stops.map((s) => [s.name, s.photo?.id ?? null])).toEqual([
        ['해운대', photoId],
        ['광안리', null],
      ]);
      expect(body.stops[0].photo?.thumbnailUrl).toBe(
        `fake-s3://${thumbKeyOf(photoId)}?get&expires=3600`,
      );
      expect(without).toBeDefined();
    });

    it('장소를 고친 응답에도 사진이 있다', async () => {
      const stopId = await addStop('해운대');
      const photoId = await attach(stopId);

      const stop = (
        await api()
          .patch(`/v1/stops/${stopId}`)
          .set('Authorization', bearer(me.token))
          .send({ name: '해운대 해수욕장' })
          .expect(200)
      ).body as { photo: Photo };

      expect(stop.photo.id).toBe(photoId);
    });

    it('사진이 있으면 새 사진으로 바꾸고 전 사진 파일과 줄을 지운다', async () => {
      const stopId = await addStop('해운대');
      const first = await attach(stopId);

      const second = await attach(stopId);

      expect((await detail()).stops[0].photo?.id).toBe(second);
      expect(await prisma.photo.findMany({ select: { id: true } })).toEqual([
        { id: second },
      ]);
      expect(storage.keys()).toEqual(
        [keyOf(second), thumbKeyOf(second)].sort(),
      );
      expect(first).not.toBe(second);
    });

    it('등록하면 여행의 고친 시각이 바뀐다', async () => {
      const stopId = await addStop('해운대');
      const before = (await detail()).trip.updatedAt;

      await attach(stopId);

      expect((await detail()).trip.updatedAt > before).toBe(true);
    });

    it('같은 장소에 같은 ID를 다시 등록하면 그대로 돌려준다 (응답을 잃고 다시 보낸 경우)', async () => {
      const stopId = await addStop('해운대');
      const photoId = await attach(stopId);

      const again = (await register(stopId, photoId).expect(200)).body as {
        photo: Photo;
      };

      expect(again.photo.id).toBe(photoId);
      expect(await prisma.photo.count()).toBe(1);
    });

    it('파일이 하나라도 아직 없으면 409이고 등록하지 않는다', async () => {
      const stopId = await addStop('해운대');
      const photoId = uuidv7();
      storage.upload(keyOf(photoId));

      await register(stopId, photoId).expect(409);

      expect(await prisma.photo.count()).toBe(0);
      expect(storage.files.get(keyOf(photoId))?.pending).toBe(true);
    });

    it('파일 형식이 JPEG가 아니거나 상한보다 크면 409', async () => {
      const stopId = await addStop('해운대');
      const png = uuidv7();
      storage.upload(keyOf(png), 100, 'image/png');
      storage.upload(thumbKeyOf(png), 100);
      await register(stopId, png).expect(409);

      const huge = uuidv7();
      storage.upload(keyOf(huge), 100);
      storage.upload(thumbKeyOf(huge), 512 * 1024 + 1);
      await register(stopId, huge).expect(409);

      expect(await prisma.photo.count()).toBe(0);
    });

    it('다른 장소에 등록된 사진 ID면 409', async () => {
      const a = await addStop('해운대');
      const b = await addStop('광안리');
      const photoId = await attach(a);
      // 같은 여행이라 키가 같다. 파일은 있다.

      await register(b, photoId).expect(409);
      expect((await detail()).stops.map((s) => s.photo?.id ?? null)).toEqual([
        photoId,
        null,
      ]);
    });

    it('S3에 닿지 못하면 503이고 등록하지 않는다', async () => {
      const stopId = await addStop('해운대');
      const photoId = uuidv7();
      storage.upload(keyOf(photoId));
      storage.upload(thumbKeyOf(photoId));
      storage.down = true;

      await register(stopId, photoId).expect(503);

      expect(await prisma.photo.count()).toBe(0);
    });

    it('남의 장소, 휴지통 여행의 장소는 404', async () => {
      const stopId = await addStop('해운대');
      const photoId = uuidv7();
      storage.upload(keyOf(photoId));
      storage.upload(thumbKeyOf(photoId));
      const other = await createUserWithToken(app);

      await register(stopId, photoId, other.token).expect(404);
      await api()
        .delete(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(204);
      await register(stopId, photoId).expect(404);
      expect(await prisma.photo.count()).toBe(0);
    });
  });

  describe('지우기', () => {
    it('S3 파일부터 지우고 장소에서 사진을 뺀다', async () => {
      const stopId = await addStop('해운대');
      await attach(stopId);

      await removePhoto(stopId).expect(204);

      expect(storage.keys()).toEqual([]);
      expect(await prisma.photo.count()).toBe(0);
      expect((await detail()).stops[0].photo).toBeNull();
    });

    it('사진이 없어도 204 (다시 보낸 경우)', async () => {
      const stopId = await addStop('해운대');

      await removePhoto(stopId).expect(204);
    });

    it('S3에 닿지 못하면 503이고 사진은 그대로다', async () => {
      const stopId = await addStop('해운대');
      const photoId = await attach(stopId);
      storage.down = true;

      await removePhoto(stopId).expect(503);

      storage.down = false;
      expect((await detail()).stops[0].photo?.id).toBe(photoId);
      expect(storage.keys()).toHaveLength(2);
    });

    it('남의 장소는 404이고 그대로다', async () => {
      const stopId = await addStop('해운대');
      await attach(stopId);
      const other = await createUserWithToken(app);

      await removePhoto(stopId, other.token).expect(404);
      expect(await prisma.photo.count()).toBe(1);
    });
  });

  describe('장소와 여행을 지울 때', () => {
    it('장소를 지우면 사진 파일과 줄을 먼저 지운다', async () => {
      const a = await addStop('해운대');
      const b = await addStop('광안리');
      const kept = await attach(b);
      await attach(a);

      await api()
        .delete(`/v1/stops/${a}`)
        .set('Authorization', bearer(me.token))
        .expect(200);

      expect(storage.keys()).toEqual([keyOf(kept), thumbKeyOf(kept)].sort());
      expect(await prisma.photo.count()).toBe(1);
    });

    it('장소를 지울 때 S3에 닿지 못하면 503이고 장소와 사진이 그대로다', async () => {
      const a = await addStop('해운대');
      await attach(a);
      storage.down = true;

      await api()
        .delete(`/v1/stops/${a}`)
        .set('Authorization', bearer(me.token))
        .expect(503);

      storage.down = false;
      const body = await detail();
      expect(body.stops.map((s) => s.id)).toEqual([a]);
      expect(body.stops[0].photo).not.toBeNull();
    });

    it('후보로 빼면 사진 파일과 줄을 지우고 후보가 된다', async () => {
      const a = await addStop('해운대');
      await attach(a);

      const body = (
        await api()
          .post(`/v1/stops/${a}/candidate`)
          .set('Authorization', bearer(me.token))
          .expect(200)
      ).body as Detail;

      expect(body.stops).toEqual([]);
      expect(body.candidates.map((c) => c.id)).toEqual([a]);
      expect(storage.keys()).toEqual([]);
      expect(await prisma.photo.count()).toBe(0);
    });

    it('휴지통으로 옮길 때는 지우지 않고, 되살리면 사진이 그대로다', async () => {
      const a = await addStop('해운대');
      const photoId = await attach(a);

      await api()
        .delete(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(204);
      expect(storage.keys()).toHaveLength(2);
      await api()
        .post(`/v1/trash/${tripId}/restore`)
        .set('Authorization', bearer(me.token))
        .expect(200);

      expect((await detail()).stops[0].photo?.id).toBe(photoId);
    });

    it('휴지통에서 영구 삭제하면 그 여행의 사진 파일만 지운다', async () => {
      const a = await addStop('해운대');
      await attach(a);
      const otherTrip = await createTrip();
      const kept = await attach(await addStop('서면', otherTrip), otherTrip);
      await api()
        .delete(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(204);

      await api()
        .delete(`/v1/trash/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(204);

      expect(storage.keys()).toEqual(
        [keyOf(kept, otherTrip), thumbKeyOf(kept, otherTrip)].sort(),
      );
      expect(await prisma.trip.count()).toBe(1);
      expect(await prisma.photo.count()).toBe(1);
    });

    it('예약 삭제는 기간이 끝난 여행의 사진 파일부터 지우고, S3에 닿지 못한 여행은 남겨 다음에 지운다', async () => {
      const now = new Date('2026-12-10T09:00:00.000Z');
      const expired = new Date('2026-11-01T00:00:00.000Z');
      await attach(await addStop('해운대'));
      const second = await createTrip();
      await attach(await addStop('서면', second), second);
      await prisma.trip.updateMany({ data: { deletedAt: expired } });
      const trash = app.get(TrashService);

      // 한 여행만 S3 장애를 흉내 낸다: 지우기 요청마다 첫 여행이면 실패.
      const deleteMany = storage.deleteMany.bind(storage);
      const spy = jest
        .spyOn(storage, 'deleteMany')
        .mockImplementation((keys) =>
          keys.some((key) => key.includes(tripId))
            ? Promise.reject(new Error('S3 장애'))
            : deleteMany(keys),
        );
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      await expect(trash.purgeExpired(now)).resolves.toBe(1);
      expect(
        (await prisma.trip.findMany({ select: { id: true } })).map((t) => t.id),
      ).toEqual([tripId]);
      expect(storage.keys().every((key) => key.includes(tripId))).toBe(true);

      spy.mockRestore();
      await expect(trash.purgeExpired(now)).resolves.toBe(1);
      expect(await prisma.trip.count()).toBe(0);
      expect(await prisma.photo.count()).toBe(0);
      expect(storage.keys()).toEqual([]);
      jest.restoreAllMocks();
    });

    it('영구 삭제 때 S3에 닿지 못하면 503이고 휴지통에 그대로다', async () => {
      await attach(await addStop('해운대'));
      await api()
        .delete(`/v1/trips/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(204);
      storage.down = true;

      await api()
        .delete(`/v1/trash/${tripId}`)
        .set('Authorization', bearer(me.token))
        .expect(503);

      expect(await prisma.trip.count()).toBe(1);
      expect(await prisma.photo.count()).toBe(1);
    });
  });
});
