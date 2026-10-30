import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  function serviceWith(queryRaw: jest.Mock): HealthService {
    return new HealthService({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  }

  it('DB에 쿼리가 닿으면 ok, up', async () => {
    const service = serviceWith(
      jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    );

    // CI 빨강 확인용으로 일부러 틀린 값(원래 'ok'). main에 합치지 않는다.
    await expect(service.check()).resolves.toEqual({
      status: 'broken',
      database: 'up',
    });
  });

  it('DB 쿼리가 실패하면 error, down', async () => {
    const service = serviceWith(
      jest.fn().mockRejectedValue(new Error('connection refused')),
    );

    await expect(service.check()).resolves.toEqual({
      status: 'error',
      database: 'down',
    });
  });
});
