import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PhotoStorage } from '../storage/photo-storage';
import { CreateStopDto } from './dto/create-stop.dto';
import { MoveStopDto } from './dto/move-stop.dto';
import { StopResponse, toStopResponse } from './dto/stop-response.dto';
import { TripDetailResponse } from './dto/trip-detail-response.dto';
import { UpdateStopDto } from './dto/update-stop.dto';
import { PhotoLinks } from './photo-links';
import { PHOTO_TX_OPTIONS, releasePhotos } from './photo-rules';
import { checkPlace, ensureNotCandidate } from './place-checks';
import { placeStop, removeStop } from './route';
import {
  applyRoute,
  checkDay,
  plannedTimeData,
  routeStops,
} from './route-apply';
import { lockOwnedTrip } from './trip-lock';
import { PHOTO_ORDER } from './trip-detail';
import { touchTrip } from './trip-touch';
import { visitData } from './visit';

/**
 * 장소. 넣기·옮기기·지우기·후보로 빼기는 동선(순서와 구간)을 바꾸므로, 여행 줄을 잠근 트랜잭션에서
 * `route.ts`로 다음 동선을 계산해 반영하고 새 동선 전체를 돌려준다.
 * 남의 여행·장소는 없는 것과 똑같이 404다.
 */
@Injectable()
export class StopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorage,
    private readonly links: PhotoLinks,
  ) {}

  /**
   * 같은 ID의 장소가 이미 있으면 전역 Prisma 필터가 409로 바꾼다(같은 곳을 다시 넣을 때는 앱이 새 ID를 만든다).
   * 같은 ID의 후보가 있어도 409다(후보를 동선에 넣는 것은 POST /v1/candidates/:id/stop).
   */
  async create(
    userId: string,
    tripId: string,
    dto: CreateStopDto,
  ): Promise<TripDetailResponse> {
    checkPlace(dto.placeProvider ?? null, dto.placeId ?? null);
    return this.prisma.$transaction(async (tx) => {
      const { nights } = await lockOwnedTrip(tx, userId, tripId);
      checkDay(nights, dto.day);
      await ensureNotCandidate(tx, dto.id);
      const before = await routeStops(tx, tripId);
      const after = placeStop(
        before,
        { id: dto.id, day: dto.day, order: dto.order },
        dto.day,
        dto.order,
      );
      // 새 장소는 계산한 최종 자리로 먼저 넣는다. 뒤 장소와 잠깐 순서가 겹쳐도 미룬 유일 제약이라 커밋 때만 검사한다.
      await tx.stop.create({
        data: {
          id: dto.id,
          tripId,
          day: dto.day,
          order: after.find((stop) => stop.id === dto.id)!.order,
          latitude: dto.latitude,
          longitude: dto.longitude,
          name: dto.name,
          address: dto.address,
          kind: dto.kind,
          description: dto.description,
          memo: dto.memo,
          plannedTime: plannedTimeData(dto.plannedTime),
          timeZone: dto.timeZone,
          placeProvider: dto.placeProvider,
          placeId: dto.placeId,
          photoSide: dto.photoSide,
        },
      });
      return applyRoute(tx, tripId, before, after, this.links);
    });
  }

  /** 이름·좌표·설명·방문 시각 등을 바꾼다. 동선 자리는 그대로라 장소 하나만 돌려준다. */
  async update(
    userId: string,
    stopId: string,
    dto: UpdateStopDto,
  ): Promise<StopResponse> {
    const stop = await this.findOwned(userId, stopId);
    checkPlace(
      dto.placeProvider === undefined ? stop.placeProvider : dto.placeProvider,
      dto.placeId === undefined ? stop.placeId : dto.placeId,
    );
    const visit = visitData(dto.visitedAt, new Date());
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.stop.update({
        where: { id: stopId },
        data: {
          ...visit,
          latitude: dto.latitude,
          longitude: dto.longitude,
          name: dto.name,
          address: dto.address,
          kind: dto.kind,
          description: dto.description,
          memo: dto.memo,
          plannedTime: plannedTimeData(dto.plannedTime),
          timeZone: dto.timeZone,
          placeProvider: dto.placeProvider,
          placeId: dto.placeId,
          photoSide: dto.photoSide,
        },
      });
      await touchTrip(tx, stop.tripId);
      const photo = await tx.photo.findFirst({
        where: { stopId },
        orderBy: PHOTO_ORDER,
      });
      return toStopResponse(updated, photo ? await this.links.of(photo) : null);
    });
  }

  /** 장소를 그 일차의 order 자리로 옮기고 구간을 다시 잇는다. */
  async move(
    userId: string,
    stopId: string,
    dto: MoveStopDto,
  ): Promise<TripDetailResponse> {
    const { tripId } = await this.findOwned(userId, stopId);
    return this.prisma.$transaction(async (tx) => {
      const { nights } = await lockOwnedTrip(tx, userId, tripId);
      checkDay(nights, dto.day);
      const before = await routeStops(tx, tripId);
      const stop = before.find((s) => s.id === stopId);
      // 잠그기 전에 다른 요청이 지웠을 수 있다.
      if (!stop) throw new NotFoundException();
      return applyRoute(
        tx,
        tripId,
        before,
        placeStop(before, stop, dto.day, dto.order),
        this.links,
      );
    });
  }

  /**
   * 장소를 지우고 앞뒤 장소를 새 구간으로 잇는다. 그 장소의 구간은 DB가 함께 지운다.
   * 사진은 같은 자리 장소가 남아 있으면 그 장소로 넘기고, 아니면 S3 파일부터 지운다([releasePhotos]).
   * S3에 닿지 못하면 503이고 장소는 그대로다.
   */
  async remove(userId: string, stopId: string): Promise<TripDetailResponse> {
    const { tripId } = await this.findOwned(userId, stopId);
    return this.prisma.$transaction(async (tx) => {
      await lockOwnedTrip(tx, userId, tripId);
      const before = await routeStops(tx, tripId);
      // 잠그기 전에 다른 요청이 지웠을 수 있어서 잠근 뒤에 다시 읽는다.
      const stop = await tx.stop.findFirst({ where: { id: stopId, tripId } });
      if (!stop) throw new NotFoundException();
      await releasePhotos(tx, this.storage, stop);
      await tx.stop.delete({ where: { id: stopId } });
      return applyRoute(
        tx,
        tripId,
        before,
        removeStop(before, stopId),
        this.links,
      );
    }, PHOTO_TX_OPTIONS);
  }

  /**
   * 장소를 같은 ID의 후보로 바꾼다. 장소를 지운 것처럼 앞뒤를 새 구간으로 잇고, 후보는 넣은 순서의 맨 뒤에 온다.
   * 후보로 옮기는 것: 좌표·이름·종류·설명·메모·장소 서비스 ID. 일차·순서·예정 시각·방문·시간대와 닿은 구간의 이동 수단은 사라진다.
   * 후보에는 사진이 없어서, 사진은 같은 자리 장소가 남아 있으면 그 장소로 넘기고 아니면 S3 파일부터 지운다
   * (앱이 빼기 전에 알린다). S3에 닿지 못하면 503이고 그대로다.
   */
  async demote(userId: string, stopId: string): Promise<TripDetailResponse> {
    const { tripId } = await this.findOwned(userId, stopId);
    return this.prisma.$transaction(async (tx) => {
      await lockOwnedTrip(tx, userId, tripId);
      const before = await routeStops(tx, tripId);
      // 잠그기 전에 다른 요청이 지웠거나 옮겼을 수 있어서 잠근 뒤에 다시 읽는다.
      const stop = await tx.stop.findFirst({ where: { id: stopId, tripId } });
      if (!stop) throw new NotFoundException();
      await releasePhotos(tx, this.storage, stop);
      await tx.stop.delete({ where: { id: stopId } });
      await tx.candidate.create({
        data: {
          id: stop.id,
          tripId,
          latitude: stop.latitude,
          longitude: stop.longitude,
          name: stop.name,
          address: stop.address,
          kind: stop.kind,
          description: stop.description,
          memo: stop.memo,
          placeProvider: stop.placeProvider,
          placeId: stop.placeId,
        },
      });
      return applyRoute(
        tx,
        tripId,
        before,
        removeStop(before, stopId),
        this.links,
      );
    }, PHOTO_TX_OPTIONS);
  }

  /** 내 여행의 장소. 없거나 남의 장소, 휴지통 여행의 장소면 404. */
  private async findOwned(userId: string, stopId: string) {
    const stop = await this.prisma.stop.findFirst({
      where: { id: stopId, trip: { userId, deletedAt: null } },
    });
    if (!stop) throw new NotFoundException();
    return stop;
  }
}
