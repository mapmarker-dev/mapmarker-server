import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { SessionsService } from '../src/auth/sessions.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createUserWithSession } from './setup/auth';
import { truncateAll } from './setup/database';

describe('로그인 세션: 재발급·로그아웃 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const DAY_MS = 24 * 60 * 60 * 1000;

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
  });

  afterAll(async () => {
    await app.close();
  });

  function refresh(refreshToken: unknown) {
    return request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken });
  }

  function logout(refreshToken: unknown) {
    return request(app.getHttpServer())
      .post('/v1/auth/logout')
      .send({ refreshToken });
  }

  describe('세션 열기', () => {
    it('access 토큰은 15분, refresh 토큰은 30일 뒤 만료로 준다', async () => {
      const before = Date.now();
      const tokens = await createUserWithSession(app);

      const accessMs = Date.parse(tokens.accessTokenExpiresAt) - before;
      const refreshMs = Date.parse(tokens.refreshTokenExpiresAt) - before;
      expect(accessMs).toBeGreaterThan(14 * 60 * 1000);
      expect(accessMs).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
      expect(refreshMs).toBeGreaterThan(30 * DAY_MS - 60_000);
      expect(refreshMs).toBeLessThanOrEqual(30 * DAY_MS + 1000);
    });

    it('DB에는 비밀이 아니라 해시만 남는다', async () => {
      const { refreshToken } = await createUserWithSession(app);
      const [sessionId, secret] = refreshToken.split('.');

      const session = await prisma.authSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      expect(Buffer.from(session.tokenHash).toString('base64url')).not.toBe(
        secret,
      );
      expect(session.tokenHash).toHaveLength(32);
    });

    it('새로 열 때 그 사용자의 만료된 세션만 치운다', async () => {
      const mine = await createUserWithSession(app);
      const others = await createUserWithSession(app);
      await prisma.authSession.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await app.get(SessionsService).start(mine.userId);

      expect(
        await prisma.authSession.count({ where: { userId: mine.userId } }),
      ).toBe(1);
      expect(
        await prisma.authSession.count({ where: { userId: others.userId } }),
      ).toBe(1);
    });
  });

  describe('POST /v1/auth/refresh', () => {
    it('새 토큰 쌍을 주고, 새 access 토큰으로 API를 부른다', async () => {
      const first = await createUserWithSession(app);

      const response = await refresh(first.refreshToken).expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        accessTokenExpiresAt: expect.any(String),
        refreshToken: expect.any(String),
        refreshTokenExpiresAt: expect.any(String),
      });
      expect(response.body.refreshToken).not.toBe(first.refreshToken);
      // 같은 세션(기기)이라 세션 ID는 그대로, 비밀만 바뀐다.
      expect(response.body.refreshToken.split('.')[0]).toBe(
        first.refreshToken.split('.')[0],
      );
      const me = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', bearer(response.body.accessToken))
        .expect(200);
      expect(me.body.id).toBe(first.userId);
    });

    it('재발급할 때마다 만료를 지금부터 30일 뒤로 다시 잡는다', async () => {
      const { refreshToken } = await createUserWithSession(app);
      await prisma.authSession.updateMany({
        data: { expiresAt: new Date(Date.now() + DAY_MS) },
      });

      const response = await refresh(refreshToken).expect(200);

      const leftMs =
        Date.parse(response.body.refreshTokenExpiresAt) - Date.now();
      expect(leftMs).toBeGreaterThan(29 * DAY_MS);
      const session = await prisma.authSession.findFirstOrThrow();
      expect(session.expiresAt.toISOString()).toBe(
        response.body.refreshTokenExpiresAt,
      );
    });

    it('새 토큰을 받은 뒤 예전 토큰이 다시 오면 탈취로 보고 그 세션을 끊는다', async () => {
      const first = await createUserWithSession(app);
      const second = (await refresh(first.refreshToken).expect(200)).body;

      await refresh(first.refreshToken).expect(401);

      // 진짜 기기가 가진 새 토큰도 더는 쓸 수 없다. 둘 다 다시 로그인해야 한다.
      await refresh(second.refreshToken).expect(401);
      expect(await prisma.authSession.count()).toBe(0);
    });

    it('같은 토큰이 동시에 두 번 오면 한쪽만 성공하고 세션은 끊긴다', async () => {
      const { refreshToken } = await createUserWithSession(app);

      const responses = await Promise.all([
        refresh(refreshToken),
        refresh(refreshToken),
      ]);

      expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 401,
      ]);
      const winner = responses.find((r) => r.status === 200)!;
      await refresh(winner.body.refreshToken).expect(401);
    });

    it('만료된 토큰은 401이고 세션을 지운다', async () => {
      const { refreshToken } = await createUserWithSession(app);
      await prisma.authSession.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await refresh(refreshToken).expect(401);

      expect(await prisma.authSession.count()).toBe(0);
    });

    it('다른 기기의 세션은 그대로다', async () => {
      const phone = await createUserWithSession(app);
      const tablet = await app.get(SessionsService).start(phone.userId);
      const next = (await refresh(phone.refreshToken).expect(200)).body;

      await refresh(phone.refreshToken).expect(401);

      await refresh(tablet.refreshToken).expect(200);
      await refresh(next.refreshToken).expect(401);
    });

    it('회원이 지워지면 401', async () => {
      const { userId, refreshToken } = await createUserWithSession(app);
      await prisma.user.delete({ where: { id: userId } });

      await refresh(refreshToken).expect(401);
    });

    it('모르거나 모양이 틀린 토큰은 401이고 다른 세션은 그대로다', async () => {
      const { refreshToken } = await createUserWithSession(app);
      const [sessionId] = refreshToken.split('.');

      for (const token of [
        '',
        'not-a-token',
        sessionId,
        `0192f0c2-7a3b-7c4d-8e5f-0123456789ab.${'A'.repeat(43)}`,
      ]) {
        await refresh(token).expect(401);
      }

      expect(await prisma.authSession.count()).toBe(1);
    });

    it('본문이 틀리면 400', async () => {
      await refresh(undefined).expect(400);
      await refresh(42).expect(400);
      await refresh('x'.repeat(201)).expect(400);
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'x', extra: 1 })
        .expect(400);
    });
  });

  describe('POST /v1/auth/logout', () => {
    it('그 기기의 세션을 지우고 204, 그 뒤 재발급은 401', async () => {
      const { refreshToken } = await createUserWithSession(app);

      await logout(refreshToken).expect(204);

      expect(await prisma.authSession.count()).toBe(0);
      await refresh(refreshToken).expect(401);
    });

    it('access 토큰 없이 부른다 (만료된 뒤에도 로그아웃할 수 있게)', async () => {
      const { refreshToken } = await createUserWithSession(app);

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Authorization', bearer('expired-or-garbage'))
        .send({ refreshToken })
        .expect(204);
    });

    it('모르거나 이미 지운 토큰도 204', async () => {
      const { refreshToken } = await createUserWithSession(app);
      await logout(refreshToken).expect(204);

      await logout(refreshToken).expect(204);
      await logout('not-a-token').expect(204);
    });

    it('예전 토큰으로는 지우지 않는다 (지금 토큰만)', async () => {
      const first = await createUserWithSession(app);
      const next = (await refresh(first.refreshToken).expect(200)).body;

      await logout(first.refreshToken).expect(204);

      await refresh(next.refreshToken).expect(200);
    });

    it('다른 기기의 세션은 그대로다', async () => {
      const phone = await createUserWithSession(app);
      const tablet = await app.get(SessionsService).start(phone.userId);

      await logout(phone.refreshToken).expect(204);

      await refresh(tablet.refreshToken).expect(200);
    });

    it('본문이 틀리면 400', async () => {
      await logout(undefined).expect(400);
    });
  });

  it('Swagger에서 재발급·로그아웃은 bearer 없이, /me는 bearer로 표시된다', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const paths = response.body.paths;

    expect(paths['/v1/auth/refresh'].post.security).toBeUndefined();
    expect(paths['/v1/auth/logout'].post.security).toBeUndefined();
    expect(paths['/v1/auth/me'].get.security).toEqual([{ bearer: [] }]);
  });
});
