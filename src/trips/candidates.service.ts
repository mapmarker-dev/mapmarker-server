import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CandidateResponse,
  toCandidateResponse,
} from './dto/candidate-response.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { PromoteCandidateDto } from './dto/promote-candidate.dto';
import { TripDetailResponse } from './dto/trip-detail-response.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { checkPlace, ensureNotStop } from './place-checks';
import { placeStop } from './route';
import {
  applyRoute,
  checkDay,
  plannedTimeData,
  routeStops,
} from './route-apply';
import { lockOwnedTrip } from './trip-lock';
import { touchTrip } from './trip-touch';

/**
 * 후보 장소. 동선(일차·순서·구간)에 들지 않아서 넣기·고치기·지우기는 후보 하나만 다룬다.
 * 동선에 넣기는 같은 ID의 장소로 바꾸고 새 동선 전체를 돌려준다(반대인 후보로 빼기는 StopsService.demote).
 * 남의 여행·후보, 휴지통 여행의 후보는 없는 것과 똑같이 404다. 바꾸면 여행의 고친 시각도 바꾼다.
 */
@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 같은 ID의 후보는 전역 Prisma 필터가, 같은 ID의 장소는 [ensureNotStop]이 409로 막는다. */
  async create(
    userId: string,
    tripId: string,
    dto: CreateCandidateDto,
  ): Promise<CandidateResponse> {
    checkPlace(dto.placeProvider ?? null, dto.placeId ?? null);
    return this.prisma.$transaction(async (tx) => {
      await lockOwnedTrip(tx, userId, tripId);
      await ensureNotStop(tx, dto.id);
      const candidate = await tx.candidate.create({
        data: {
          id: dto.id,
          tripId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          name: dto.name,
          kind: dto.kind,
          description: dto.description,
          memo: dto.memo,
          placeProvider: dto.placeProvider,
          placeId: dto.placeId,
        },
      });
      await touchTrip(tx, tripId);
      return toCandidateResponse(candidate);
    });
  }

  async update(
    userId: string,
    candidateId: string,
    dto: UpdateCandidateDto,
  ): Promise<CandidateResponse> {
    const candidate = await this.findOwned(userId, candidateId);
    checkPlace(
      dto.placeProvider === undefined
        ? candidate.placeProvider
        : dto.placeProvider,
      dto.placeId === undefined ? candidate.placeId : dto.placeId,
    );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.candidate.update({
        where: { id: candidateId },
        data: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          name: dto.name,
          kind: dto.kind,
          description: dto.description,
          memo: dto.memo,
          placeProvider: dto.placeProvider,
          placeId: dto.placeId,
        },
      });
      await touchTrip(tx, candidate.tripId);
      return toCandidateResponse(updated);
    });
  }

  /** 휴지통을 거치지 않고 바로 지운다(장소와 같다). */
  async remove(userId: string, candidateId: string): Promise<void> {
    const { tripId } = await this.findOwned(userId, candidateId);
    await this.prisma.$transaction(async (tx) => {
      await tx.candidate.delete({ where: { id: candidateId } });
      await touchTrip(tx, tripId);
    });
  }

  /**
   * 후보를 같은 ID의 장소로 바꿔 [dto]의 일차·자리에 넣고, 새 동선 전체를 돌려준다(장소 넣기와 같은 규칙).
   * 좌표·장소 서비스 ID는 후보의 것, 이름·종류·설명·메모는 보낸 값이 있으면 그 값이다.
   */
  async promote(
    userId: string,
    candidateId: string,
    dto: PromoteCandidateDto,
  ): Promise<TripDetailResponse> {
    const { tripId } = await this.findOwned(userId, candidateId);
    return this.prisma.$transaction(async (tx) => {
      const { nights } = await lockOwnedTrip(tx, userId, tripId);
      checkDay(nights, dto.day);
      // 잠그기 전에 다른 요청이 지웠거나 동선에 넣었을 수 있어서 잠근 뒤에 다시 읽는다.
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, tripId },
      });
      if (!candidate) throw new NotFoundException();
      await tx.candidate.delete({ where: { id: candidateId } });

      const before = await routeStops(tx, tripId);
      const after = placeStop(
        before,
        { id: candidateId, day: dto.day, order: dto.order },
        dto.day,
        dto.order,
      );
      // 장소 넣기처럼 계산한 최종 자리로 먼저 넣는다(미룬 유일 제약).
      await tx.stop.create({
        data: {
          id: candidateId,
          tripId,
          day: dto.day,
          order: after.find((stop) => stop.id === candidateId)!.order,
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          name: dto.name ?? candidate.name,
          kind: dto.kind ?? candidate.kind,
          description: dto.description ?? candidate.description,
          memo: dto.memo ?? candidate.memo,
          plannedTime: plannedTimeData(dto.plannedTime),
          timeZone: dto.timeZone,
          placeProvider: candidate.placeProvider,
          placeId: candidate.placeId,
        },
      });
      return applyRoute(tx, tripId, before, after);
    });
  }

  /** 내 여행의 후보. 없거나 남의 후보, 휴지통 여행의 후보면 404. */
  private async findOwned(userId: string, candidateId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, trip: { userId, deletedAt: null } },
    });
    if (!candidate) throw new NotFoundException();
    return candidate;
  }
}
