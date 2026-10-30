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

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
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
