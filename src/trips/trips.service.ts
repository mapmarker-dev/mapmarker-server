import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseLocalDate } from '../common/local-date';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTripDto } from './dto/create-trip.dto';
import {
  toTripDetailResponse,
  TripDetailResponse,
} from './dto/trip-detail-response.dto';
import { toTripResponse, TripResponse } from './dto/trip-response.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { checkTripDates, TripDates } from './trip-dates';
import { lockOwnedTrip } from './trip-lock';

/**
 * 여행. 모든 쿼리를 사용자 ID로 거른다. 남의 여행은 없는 여행과 똑같이 404라서, 있는지도 알 수 없다.
 * 자동 상태(전/중/후)는 계산하지 않는다. 사용자가 직접 바꾼 상태(phaseOverride)만 저장하고 돌려준다.
 */
@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 내 여행 목록. 최근에 고친 여행이 앞에 온다. */
  async list(userId: string): Promise<TripResponse[]> {
    const trips = await this.prisma.trip.findMany({
      where: { userId },
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
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, userId },
      include: {
        stops: { orderBy: [{ day: 'asc' }, { order: 'asc' }] },
        segments: true,
      },
    });
    if (!trip) throw new NotFoundException();
    const { stops, segments, ...fields } = trip;
    return toTripDetailResponse(fields, stops, segments);
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
   * 여행을 지운다. 장소·구간은 DB가 함께 지운다.
   * 사진이 달린 장소가 있으면 DB가 막아서(Restrict) 409다. 사진 단계(1-3)에서 사진과 S3 파일부터 지우게 바꾼다.
   */
  async remove(userId: string, tripId: string): Promise<void> {
    let count: number;
    try {
      ({ count } = await this.prisma.trip.deleteMany({
        where: { id: tripId, userId },
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
}

/** API의 기간 → DB 칼럼. null이면 둘 다 비운다(날짜 미정). */
function datesData(dates: TripDates | null) {
  return {
    startDate: dates ? parseLocalDate(dates.start) : null,
    endDate: dates ? parseLocalDate(dates.end) : null,
  };
}
