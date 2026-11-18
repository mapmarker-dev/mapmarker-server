import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JusoAddress } from '../src/addresses/juso.client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createUserWithToken } from './setup/auth';
import { truncateAll } from './setup/database';
import { FakeJusoClient, withFakeJuso } from './setup/juso';

describe('주소 API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let juso: FakeJusoClient;
  let token: string;

  const address: JusoAddress = {
    roadAddress: '경기도 안양시 동안구 관악대로 472',
    roadAddressExtra: '(관양동)',
    jibunAddress: '경기도 안양시 동안구 관양동 1588',
    buildingName: null,
    zipCode: '14054',
    ref: {
      admCd: '4117310400',
      rnMgtSn: '411734349005',
      udrtYn: '0',
      buldMnnm: 472,
      buldSlno: 0,
    },
  };

  const ref = {
    admCd: '4117310400',
    rnMgtSn: '411734349005',
    udrtYn: '0',
    buldMnnm: '472',
    buldSlno: '0',
  };

  beforeAll(async () => {
    juso = new FakeJusoClient();
    const moduleRef = await withFakeJuso(
      Test.createTestingModule({ imports: [AppModule] }),
      juso,
    ).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    token = (await createUserWithToken(app)).token;
    juso.addresses = [address];
    juso.totalCount = null;
    juso.coordinate = { x: 1000000, y: 2000000 };
    juso.down = false;
    juso.keywords.length = 0;
    juso.refs.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(app.getHttpServer());

  function search(query?: string, auth = true) {
    const req = api().get('/v1/addresses');
    if (query !== undefined) void req.query({ query });
    if (auth) void req.set('Authorization', bearer(token));
    return req;
  }

  function coordinate(params: Record<string, string>, auth = true) {
    const req = api().get('/v1/addresses/coordinates').query(params);
    if (auth) void req.set('Authorization', bearer(token));
    return req;
  }

  describe('주소 검색', () => {
    it('다듬은 검색어로 찾고, 떼어 낸 상세 주소와 결과를 돌려준다', async () => {
      const response = await search(
        '경기 안양시 동안구 관악대로 472 1,2층',
      ).expect(200);

      expect(juso.keywords).toEqual(['경기 안양시 동안구 관악대로 472']);
      expect(response.body).toEqual({
        detail: '1,2층',
        addresses: [address],
        totalCount: 1,
      });
    });

    it('결과가 더 있으면 행안부의 전체 개수를 함께 준다', async () => {
      juso.addresses = Array<JusoAddress>(10).fill(address);
      juso.totalCount = 1234;

      const response = await search('강남역').expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({ totalCount: 1234 }),
      );
      expect(response.body.addresses).toHaveLength(10);
    });

    it('정확히 10건이면 전체 개수도 10이다', async () => {
      juso.addresses = Array<JusoAddress>(10).fill(address);

      const response = await search('관악대로 472').expect(200);

      expect(response.body.totalCount).toBe(10);
    });

    it('결과가 없으면 빈 목록이다', async () => {
      juso.addresses = [];

      const response = await search('없는길 1').expect(200);

      expect(response.body).toEqual({
        detail: null,
        addresses: [],
        totalCount: 0,
      });
    });

    it.each([
      ['검색어가 없음', undefined],
      ['빈칸뿐', '  '],
      ['다듬으면 빔', '%=<>'],
      ['한 글자', '가'],
      ['200자를 넘음', '가'.repeat(201)],
    ])('400: %s', async (_, query) => {
      await search(query).expect(400);
      expect(juso.keywords).toEqual([]);
    });

    it('모르는 쿼리 값은 400', async () => {
      await api()
        .get('/v1/addresses')
        .query({ query: '세종대로 110', page: '2' })
        .set('Authorization', bearer(token))
        .expect(400);
    });

    it('행안부에 닿지 못하면 503', async () => {
      juso.down = true;

      await search('세종대로 110').expect(503);
    });
  });

  describe('좌표', () => {
    it('건물 키로 찾은 UTM-K 좌표를 위경도로 바꿔 준다', async () => {
      const response = await coordinate(ref).expect(200);

      expect(juso.refs).toEqual([{ ...address.ref }]);
      expect(response.body.latitude).toBeCloseTo(38, 9);
      expect(response.body.longitude).toBeCloseTo(127.5, 9);
    });

    it('좌표가 없으면 404', async () => {
      juso.coordinate = null;

      await coordinate(ref).expect(404);
    });

    it.each([
      ['행정구역코드가 10자리 숫자가 아님', { admCd: '41173' }],
      ['도로명코드가 12자리 숫자가 아님', { rnMgtSn: 'abc' }],
      ['지하 여부가 0·1이 아님', { udrtYn: '2' }],
      ['본번이 숫자가 아님', { buldMnnm: 'x' }],
      ['부번이 음수', { buldSlno: '-1' }],
    ])('400: %s', async (_, fields) => {
      await coordinate({ ...ref, ...fields }).expect(400);
      expect(juso.refs).toEqual([]);
    });

    it('건물 키가 빠지면 400', async () => {
      const { admCd: _, ...withoutAdmCd } = ref;

      await coordinate(withoutAdmCd).expect(400);
    });

    it('행안부에 닿지 못하면 503', async () => {
      juso.down = true;

      await coordinate(ref).expect(503);
    });
  });

  describe('인증과 문서', () => {
    it('토큰이 없으면 401', async () => {
      await search('세종대로 110', false).expect(401);
      await coordinate(ref, false).expect(401);
    });

    it('Swagger 문서에 주소 경로가 bearer 인증으로 있다', async () => {
      const response = await api().get('/docs-json').expect(200);
      const paths = (
        response.body as {
          paths: Record<string, { get: { security?: unknown[] } }>;
        }
      ).paths;

      expect(paths['/v1/addresses'].get.security).toEqual([{ bearer: [] }]);
      expect(paths['/v1/addresses/coordinates'].get.security).toEqual([
        { bearer: [] },
      ]);
    });
  });
});
