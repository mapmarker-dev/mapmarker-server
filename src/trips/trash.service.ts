import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  toTrashedTripResponse,
  TrashedTripResponse,
} from './dto/trashed-trip-response.dto';
import { toTripResponse, TripResponse } from './dto/trip-response.dto';
import { trashCutoff } from './trash-retention';

/**
 * 휴지통. 여행을 넣는 것은 TripsService.moveToTrash(DELETE /trips/:id)다.
 * 보관 기간(30일)이 끝난 여행은 한 시간마다 예약 삭제가 지우고, 그전에도 없는 여행(404)으로 본다.
 */
@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(private readonly prisma: PrismaService) {}

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
   * 휴지통의 여행을 바로 지운다. 장소·구간은 DB가 함께 지운다.
   * 사진이 달린 장소가 있으면 DB가 막아서(Restrict) 409다. 사진 단계(1-3)에서 사진과 S3 파일부터 지우게 바꾼다.
   */
  async removeForever(userId: string, tripId: string): Promise<void> {
    let count: number;
    try {
      ({ count } = await this.prisma.trip.deleteMany({
        where: {
          id: tripId,
          userId,
          deletedAt: { gt: trashCutoff(new Date()) },
        },
      }));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          '사진이 있는 장소가 있어 여행을 지울 수 없습니다',
        );
      }
      throw error;
    }
    if (count === 0) throw new NotFoundException();
  }

  /**
   * 보관 기간이 끝난 여행(넣은 지 30일 이상)을 모든 사용자에게서 지우고 지운 수를 돌려준다. 장소·구간은 DB가 함께 지운다.
   * 같은 조건으로 몇 번을 돌려도 결과가 같아서, 서버가 여러 대(4단계)여도 각자 돌려도 된다.
   * 사진(1-3)이 생기면 사진과 S3 파일부터 지우게 바꾼다. 지금은 사진이 달린 여행이 있으면 DB가 막아 이번 작업 전체가 실패한다.
   */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.trip.deleteMany({
      where: { deletedAt: { lte: trashCutoff(now) } },
    });
    return count;
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
