import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { PhotoStorage } from '../storage/photo-storage';
import { TrashService } from './trash.service';

describe('TrashService 예약 삭제 작업', () => {
  const now = new Date('2026-12-10T09:00:00.000Z');

  /**
   * [expired]가 기간이 끝난 여행이고, [failing]에 든 여행은 트랜잭션이 실패한다(예: S3 장애).
   * 트랜잭션 안의 여행 잠금은 늘 성공하고 사진은 없다고 본다.
   */
  function serviceWith(expired: string[], failing: string[] = []) {
    const findMany = jest.fn().mockResolvedValue(expired.map((id) => ({ id })));
    const deleted: string[] = [];
    const prisma = {
      trip: { findMany },
      $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) => {
        let tripId = '';
        const tx = {
          $queryRaw: jest.fn((_strings: unknown, id: string) => {
            tripId = id;
            return Promise.resolve([{ id }]);
          }),
          photo: { findMany: jest.fn().mockResolvedValue([]) },
          trip: {
            delete: jest.fn(() => {
              if (failing.includes(tripId)) {
                return Promise.reject(new Error('S3 장애'));
              }
              deleted.push(tripId);
              return Promise.resolve();
            }),
          },
        };
        return run(tx);
      }),
    } as unknown as PrismaService;
    const storage = { deleteMany: jest.fn() } as unknown as PhotoStorage;
    return { service: new TrashService(prisma, storage), findMany, deleted };
  }

  afterEach(() => jest.restoreAllMocks());

  it('보관 기간이 끝난 여행(넣은 지 30일 이상)만 골라 하나씩 지운다', async () => {
    const { service, findMany, deleted } = serviceWith(['a', 'b']);

    await expect(service.purgeExpired(now)).resolves.toBe(2);

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: { lte: new Date('2026-11-10T09:00:00.000Z') } },
      select: { id: true },
    });
    expect(deleted).toEqual(['a', 'b']);
  });

  it('한 여행을 지우지 못해도 로그를 남기고 다음 여행을 지운다', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, deleted } = serviceWith(['a', 'b', 'c'], ['b']);

    await expect(service.purgeExpired(now)).resolves.toBe(2);

    expect(deleted).toEqual(['a', 'c']);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('b'),
      expect.any(Error),
    );
  });

  it('작업이 실패해도 예외를 밖으로 내지 않고 로그를 남긴다 (다음 시간에 다시 지운다)', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { service, findMany } = serviceWith([]);
    findMany.mockRejectedValue(new Error('DB 끊김'));

    await expect(service.purgeExpiredJob()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
  });

  it('지운 여행이 있으면 수를 로그로 남긴다', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await serviceWith(['a', 'b']).service.purgeExpiredJob();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('2'));
  });
});
