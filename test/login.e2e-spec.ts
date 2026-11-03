import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer } from './setup/auth';
import { truncateAll } from './setup/database';
import { withFakeSocialProviders } from './setup/social';

/** 가짜 제공자로 확인한다. 토큰 `ok:<ID>:<닉네임>`은 통과, `down`은 503, 그 밖은 401(test/setup/social.ts). */
describe('소셜 로그인 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await withFakeSocialProviders(
      Test.createTestingModule({ imports: [AppModule] }),
    ).compile();
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

  function loginKakao(idToken: unknown) {
    return request(app.getHttpServer())
      .post('/v1/auth/login/kakao')
      .send({ idToken });
  }

  function loginNaver(accessToken: unknown) {
    return request(app.getHttpServer())
      .post('/v1/auth/login/naver')
      .send({ accessToken });
  }

  describe('처음 로그인', () => {
    it('카카오: 사용자와 소셜 계정을 만들고 토큰 쌍을 준다', async () => {
      const response = await loginKakao('ok:kakao-1:여행자').expect(200);

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        accessTokenExpiresAt: expect.any(String),
        refreshToken: expect.any(String),
        refreshTokenExpiresAt: expect.any(String),
        isNewUser: true,
        user: {
          id: expect.any(String),
          nickname: '여행자',
          createdAt: expect.any(String),
        },
      });
      expect(
        await prisma.socialAccount.findMany({
          select: { userId: true, provider: true, providerUserId: true },
        }),
      ).toEqual([
        {
          userId: response.body.user.id,
          provider: 'kakao',
          providerUserId: 'kakao-1',
        },
      ]);
    });

    it('네이버도 같다', async () => {
      const response = await loginNaver('ok:naver-1:길잡이').expect(200);

      expect(response.body).toMatchObject({
        isNewUser: true,
        user: { nickname: '길잡이' },
      });
      expect(await prisma.socialAccount.findFirstOrThrow()).toMatchObject({
        provider: 'naver',
        providerUserId: 'naver-1',
      });
    });

    it('닉네임에 동의하지 않았으면 null', async () => {
      const response = await loginKakao('ok:kakao-1').expect(200);

      expect(response.body.user.nickname).toBeNull();
    });

    it('받은 access 토큰으로 보호된 API를 부르고, refresh 토큰으로 재발급·로그아웃한다', async () => {
      const login = (await loginKakao('ok:kakao-1:여행자').expect(200)).body;

      const me = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', bearer(login.accessToken))
        .expect(200);
      expect(me.body).toEqual(login.user);

      const refreshed = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: login.refreshToken })
        .expect(200);
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken: refreshed.body.refreshToken })
        .expect(204);
      expect(await prisma.authSession.count()).toBe(0);
    });
  });

  describe('다시 로그인', () => {
    it('같은 소셜 계정이면 같은 사용자이고, 기기마다 세션이 따로 생긴다', async () => {
      const first = (await loginKakao('ok:kakao-1:여행자').expect(200)).body;

      const second = (await loginKakao('ok:kakao-1:여행자').expect(200)).body;

      expect(second.isNewUser).toBe(false);
      expect(second.user.id).toBe(first.user.id);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.authSession.count()).toBe(2);
    });

    it('제공자 닉네임이 바뀌어도 가입 때 받은 닉네임을 덮어쓰지 않는다', async () => {
      await loginKakao('ok:kakao-1:여행자').expect(200);

      const again = await loginKakao('ok:kakao-1:새이름').expect(200);

      expect(again.body.user.nickname).toBe('여행자');
    });

    it('같은 사람이 카카오와 네이버로 따로 들어오면 서로 다른 사용자다', async () => {
      const kakao = (await loginKakao('ok:same-id').expect(200)).body;

      const naver = (await loginNaver('ok:same-id').expect(200)).body;

      expect(naver.isNewUser).toBe(true);
      expect(naver.user.id).not.toBe(kakao.user.id);
    });

    it('처음 로그인이 동시에 두 번 와도 사용자는 하나만 생긴다', async () => {
      const responses = await Promise.all([
        loginKakao('ok:kakao-1'),
        loginKakao('ok:kakao-1'),
      ]);

      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(new Set(responses.map((r) => r.body.user.id)).size).toBe(1);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.socialAccount.count()).toBe(1);
    });

    it('탈퇴(회원 삭제) 뒤 다시 들어오면 새 사용자다', async () => {
      const first = (await loginKakao('ok:kakao-1').expect(200)).body;
      await prisma.user.delete({ where: { id: first.user.id } });

      const again = (await loginKakao('ok:kakao-1').expect(200)).body;

      expect(again.isNewUser).toBe(true);
      expect(again.user.id).not.toBe(first.user.id);
    });
  });

  describe('오류', () => {
    it('제공자가 거절한 토큰은 401이고 사용자를 만들지 않는다', async () => {
      await loginKakao('rejected').expect(401);
      await loginNaver('rejected').expect(401);

      expect(await prisma.user.count()).toBe(0);
    });

    it('제공자에 닿지 못하면 503이고 사용자를 만들지 않는다', async () => {
      await loginKakao('down').expect(503);
      await loginNaver('down').expect(503);

      expect(await prisma.user.count()).toBe(0);
    });

    it('본문이 틀리면 400', async () => {
      await loginKakao(undefined).expect(400);
      await loginKakao(42).expect(400);
      await loginKakao('x'.repeat(4097)).expect(400);
      // 카카오는 idToken, 네이버는 accessToken. 칸 이름을 바꿔 보내면 400.
      await request(app.getHttpServer())
        .post('/v1/auth/login/kakao')
        .send({ accessToken: 'ok:kakao-1' })
        .expect(400);
      await request(app.getHttpServer())
        .post('/v1/auth/login/naver')
        .send({ idToken: 'ok:naver-1' })
        .expect(400);
    });

    it('없는 제공자 경로는 404', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/login/google')
        .send({ idToken: 'ok:1' })
        .expect(404);
    });
  });

  it('Swagger에 로그인 경로가 bearer 없이 있다', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const { paths, components } = response.body;

    for (const path of ['/v1/auth/login/kakao', '/v1/auth/login/naver']) {
      expect(paths[path].post.security).toBeUndefined();
      expect(paths[path].post.responses).toHaveProperty('200');
      expect(paths[path].post.responses).toHaveProperty('503');
    }
    expect(components.schemas.LoginResponse.properties).toHaveProperty(
      'isNewUser',
    );
  });
});
