import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseLocalDate } from '../common/local-date';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripDetailResponse } from './dto/trip-detail-response.dto';
import { toTripResponse, TripResponse } from './dto/trip-response.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { checkTripDates, TripDates } from './trip-dates';
import { readTripDetail } from './trip-detail';
import { lockOwnedTrip } from './trip-lock';

/**
 * 여행. 모든 쿼리를 사용자 ID로 거른다. 남의 여행은 없는 여행과 똑같이 404라서, 있는지도 알 수 없다.
 * 휴지통의 여행(deletedAt)도 404다. 휴지통 안의 여행은 TrashService가 다룬다.
 * 자동 상태(전/중/후)는 계산하지 않는다. 사용자가 직접 바꾼 상태(phaseOverride)만 저장하고 돌려준다.
 */
@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 내 여행 목록(휴지통 빼고). 최근에 고친 여행이 앞에 온다. */
  async list(userId: string): Promise<TripResponse[]> {
    const trips = await this.prisma.trip.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    return trips.map(toTripResponse);
  }

  /** 이미 있는 ID면 전역 Prisma 필터가 409로 바꾼다. */
  async create(userId: string, dto: CreateTripDto): Promise<TripResponse> {
    const dates = dto.dates ?? null;
    checkTripDates(dto.nights, dates);
    const trip = await this.prisma.trip.create({
      data: {
        id: dto.id,
        userId,
        title: dto.title,
        region: dto.region,
        nights: dto.nights,
        season: dto.season,
        ...datesData(dates),
        phaseOverride: dto.phaseOverride ?? null,
        mapProvider: dto.mapProvider ?? null,
      },
    });
    return toTripResponse(trip);
  }

  async get(userId: string, tripId: string): Promise<TripDetailResponse> {
    const detail = await readTripDetail(this.prisma, {
      id: tripId,
      userId,
      deletedAt: null,
    });
    if (!detail) throw new NotFoundException();
    return detail;
  }

  /**
   * 보낸 필드만 바꾼다. 기간과 박 수는 바꾼 뒤의 값끼리 맞아야 하고(400),
   * 줄인 기간 밖 일차에 장소가 남으면 409다. 장소 넣기와 엇갈리지 않게 여행 줄을 잠그고 확인한다.
   */
  async update(
    userId: string,
    tripId: string,
    dto: UpdateTripDto,
  ): Promise<TripResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockOwnedTrip(tx, userId, tripId);
      const current = toTripResponse(
        await tx.trip.findUniqueOrThrow({ where: { id: tripId } }),
      );
      const nights = dto.nights ?? current.nights;
      const dates = dto.dates === undefined ? current.dates : dto.dates;
      checkTripDates(nights, dates);

      const { _max } = await tx.stop.aggregate({
        where: { tripId },
        _max: { day: true },
      });
      const lastStopDay = _max.day ?? 0;
      if (lastStopDay > nights + 1) {
        throw new ConflictException(
          `${lastStopDay}일차에 장소가 있어 ${nights + 1}일로 줄일 수 없습니다`,
        );
      }

      const trip = await tx.trip.update({
        where: { id: tripId },
        data: {
          title: dto.title,
          region: dto.region,
          nights: dto.nights,
          season: dto.season,
          ...(dto.dates === undefined ? {} : datesData(dto.dates)),
          phaseOverride: dto.phaseOverride,
          mapProvider: dto.mapProvider,
        },
      });
      return toTripResponse(trip);
    });
  }

  /**
   * 여행을 휴지통으로 옮긴다. 장소·구간은 그대로 두고, 되살리면 원래 자리로 돌아가게 updatedAt도 둔다
   * (Prisma의 update는 updatedAt을 바꿔서 SQL로 쓴다). 이미 휴지통에 있으면 404.
   * 여행 줄을 바꾸므로 장소 넣기 등(lockOwnedTrip)과 차례로 처리되고, 뒤에 온 쪽은 휴지통의 여행이라 404다.
   */
  async moveToTrash(userId: string, tripId: string): Promise<void> {
    const count = await this.prisma.$executeRaw`
      UPDATE trips SET deleted_at = now()
      WHERE id = ${tripId}::uuid AND user_id = ${userId}::uuid
        AND deleted_at IS NULL`;
    if (count === 0) throw new NotFoundException();
  }
}

/** API의 기간 → DB 칼럼. null이면 둘 다 비운다(날짜 미정). */
function datesData(dates: TripDates | null) {
  return {
    startDate: dates ? parseLocalDate(dates.start) : null,
    endDate: dates ? parseLocalDate(dates.end) : null,
  };
}
