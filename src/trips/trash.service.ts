import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PhotoStorage } from '../storage/photo-storage';
import {
  toTrashedTripResponse,
  TrashedTripResponse,
} from './dto/trashed-trip-response.dto';
import { toTripResponse, TripResponse } from './dto/trip-response.dto';
import { deletePhotos, PHOTO_TX_OPTIONS } from './photo-rules';
import { trashCutoff } from './trash-retention';

/**
 * 휴지통. 여행을 넣는 것은 TripsService.moveToTrash(DELETE /trips/:id)다.
 * 보관 기간(30일)이 끝난 여행은 한 시간마다 예약 삭제가 지우고, 그전에도 없는 여행(404)으로 본다.
 */
@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorage,
  ) {}

  /** 내 휴지통. 최근에 넣은 여행이 앞에 온다. */
  async list(userId: string): Promise<TrashedTripResponse[]> {
    const trips = await this.prisma.trip.findMany({
      where: { userId, deletedAt: { gt: trashCutoff(new Date()) } },
      orderBy: { deletedAt: 'desc' },
    });
    // 조건이 deletedAt > 기준 시각이라 deletedAt은 비어 있지 않다.
    return trips.map((trip) =>
      toTrashedTripResponse({ ...trip, deletedAt: trip.deletedAt! }),
    );
  }

  /**
   * 휴지통에서 꺼낸다. updatedAt을 바꾸지 않아 목록의 원래 자리로 돌아간다
   * (Prisma의 update는 updatedAt을 바꿔서 SQL로 쓴다). 공유 ID도 그대로라 공유 링크가 다시 열린다.
   */
  async restore(userId: string, tripId: string): Promise<TripResponse> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.$executeRaw`
        UPDATE trips SET deleted_at = NULL
        WHERE id = ${tripId}::uuid AND user_id = ${userId}::uuid
          AND deleted_at > ${trashCutoff(new Date())}`;
      if (count === 0) throw new NotFoundException();
      return toTripResponse(
        await tx.trip.findUniqueOrThrow({ where: { id: tripId } }),
      );
    });
  }

  /**
   * 휴지통의 여행을 바로 지운다. 사진은 S3 파일부터 지우고, 장소·구간·후보는 DB가 함께 지운다.
   * S3에 닿지 못하면 503이고 여행은 휴지통에 그대로다. 되살리기와 엇갈리지 않게 여행 줄을 잠근다.
   */
  async removeForever(userId: string, tripId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM trips
        WHERE id = ${tripId}::uuid AND user_id = ${userId}::uuid
          AND deleted_at > ${trashCutoff(new Date())}
        FOR UPDATE`;
      if (rows.length === 0) throw new NotFoundException();
      await this.deleteTrip(tx, tripId);
    }, PHOTO_TX_OPTIONS);
  }

  /**
   * 보관 기간이 끝난 여행(넣은 지 30일 이상)을 모든 사용자에게서 지우고 지운 수를 돌려준다.
   * 여행마다 따로 지워서, 한 여행의 사진을 지우지 못해도(S3 장애) 그 여행만 남고 다음 시간에 다시 지운다.
   * 같은 조건으로 몇 번을 돌려도 결과가 같아서, 서버가 여러 대(4단계)여도 각자 돌려도 된다.
   */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = trashCutoff(now);
    const expired = await this.prisma.trip.findMany({
      where: { deletedAt: { lte: cutoff } },
      select: { id: true },
    });
    let count = 0;
    for (const { id } of expired) {
      try {
        const deleted = await this.prisma.$transaction(async (tx) => {
          // 다른 서버가 먼저 지웠으면 건너뛴다. 기간이 끝난 여행은 되살릴 수 없어 조건이 바뀌지 않는다.
          const rows = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM trips
            WHERE id = ${id}::uuid AND deleted_at <= ${cutoff}
            FOR UPDATE`;
          if (rows.length === 0) return false;
          await this.deleteTrip(tx, id);
          return true;
        }, PHOTO_TX_OPTIONS);
        if (deleted) count += 1;
      } catch (error) {
        this.logger.error(`휴지통 여행 ${id}를 지우지 못했습니다`, error);
      }
    }
    return count;
  }

  /** 여행의 사진을 S3 파일부터 지우고 여행을 지운다(나머지는 DB가 함께 지운다). */
  private async deleteTrip(
    tx: Prisma.TransactionClient,
    tripId: string,
  ): Promise<void> {
    await deletePhotos(tx, this.storage, { stop: { tripId } });
    await tx.trip.delete({ where: { id: tripId } });
  }

  /** 한 시간마다 도는 예약 삭제. 실패해도 서버는 계속 돌고, 다음 시간에 다시 지운다. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'trash-purge' })
  async purgeExpiredJob(): Promise<void> {
    try {
      const count = await this.purgeExpired();
      if (count > 0) this.logger.log(`휴지통에서 여행 ${count}개를 지웠습니다`);
    } catch (error) {
      this.logger.error('휴지통 예약 삭제에 실패했습니다', error);
    }
  }
}
