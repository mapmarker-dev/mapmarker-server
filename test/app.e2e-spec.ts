import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('앱 (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health: 테스트 DB에 붙어 ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', database: 'up' });
  });

  it('health는 버전이 없고, 다른 경로는 /v1 아래에 있다', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(404);
  });

  it('GET /docs-json: Swagger 문서에 health가 있다', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);

    expect(response.body).toMatchObject({
      info: { title: 'MapMarker API' },
      paths: { '/health': { get: expect.any(Object) } },
    });
  });

  it('GET /docs: Swagger 화면이 열린다', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs')
      .expect(200);

    expect(response.text).toContain('swagger-ui');
  });
});
