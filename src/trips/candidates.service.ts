import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CandidateResponse,
  toCandidateResponse,
} from './dto/candidate-response.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { checkPlace, ensureNotStop } from './place-checks';
import { lockOwnedTrip } from './trip-lock';
import { touchTrip } from './trip-touch';

/**
 * 후보 장소. 동선(일차·순서·구간)에 들지 않아서 넣기·고치기·지우기는 후보 하나만 다룬다.
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

  /** 내 여행의 후보. 없거나 남의 후보, 휴지통 여행의 후보면 404. */
  private async findOwned(userId: string, candidateId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, trip: { userId, deletedAt: null } },
    });
    if (!candidate) throw new NotFoundException();
    return candidate;
  }
}
