import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { TrashService } from './trash.service';

describe('TrashService 예약 삭제 작업', () => {
  function serviceWith(deleteMany: jest.Mock) {
    const prisma = { trip: { deleteMany } } as unknown as PrismaService;
    return new TrashService(prisma);
  }

  afterEach(() => jest.restoreAllMocks());

  it('보관 기간이 끝난 여행(넣은 지 30일 이상)만 지운다', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const now = new Date('2026-12-10T09:00:00.000Z');

    await expect(serviceWith(deleteMany).purgeExpired(now)).resolves.toBe(3);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { deletedAt: { lte: new Date('2026-11-10T09:00:00.000Z') } },
    });
  });

  it('작업이 실패해도 예외를 밖으로 내지 않고 로그를 남긴다 (다음 시간에 다시 지운다)', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const deleteMany = jest.fn().mockRejectedValue(new Error('DB 끊김'));

    await expect(
      serviceWith(deleteMany).purgeExpiredJob(),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
  });

  it('지운 여행이 있으면 수를 로그로 남긴다', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await serviceWith(
      jest.fn().mockResolvedValue({ count: 2 }),
    ).purgeExpiredJob();

    expect(log).toHaveBeenCalledWith(expect.stringContaining('2'));
  });
});
