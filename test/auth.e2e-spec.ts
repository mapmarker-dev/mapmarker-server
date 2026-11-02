import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createUserWithToken } from './setup/auth';
import { truncateAll } from './setup/database';

describe('인증 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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

  it('토큰 없이 /v1/auth/me를 부르면 401', async () => {
    await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
  });

  it('엉터리 토큰은 401', async () => {
    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', bearer('not-a-token'))
      .expect(401);
  });

  it('서버가 서명한 토큰이면 내 ID를 돌려준다', async () => {
    const { userId, token } = await createUserWithToken(app);

    const response = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', bearer(token))
      .expect(200);

    expect(response.body).toEqual({
      id: userId,
      createdAt: expect.any(String),
    });
  });

  it('서명이 맞아도 지워진 사용자의 토큰은 401', async () => {
    const { userId, token } = await createUserWithToken(app);
    await prisma.user.delete({ where: { id: userId } });

    await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', bearer(token))
      .expect(401);
  });

  it('/health와 /docs는 토큰 없이 열린다', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/docs').expect(200);
    await request(app.getHttpServer()).get('/docs-json').expect(200);
  });

  it('Swagger 문서에 bearer 인증과 /v1/auth/me가 있다', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(response.body).toMatchObject({
      components: {
        securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      },
      paths: {
        '/v1/auth/me': { get: { security: [{ bearer: [] }] } },
      },
    });
  });
});
