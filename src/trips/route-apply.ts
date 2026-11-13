import { BadRequestException } from '@nestjs/common';
import { parseLocalTime } from '../common/local-time';
import type { Prisma } from '../generated/prisma/client';
import { TripDetailResponse } from './dto/trip-detail-response.dto';
import { diffSegments, RouteStop } from './route';
import { readTripDetail } from './trip-detail';
import { touchTrip } from './trip-touch';

/**
 * 동선을 DB에 반영하는 도우미. 장소 API와 후보 API(동선에 넣기·후보로 빼기)가 같이 쓴다.
 * 모두 여행 줄을 잠근(`lockOwnedTrip`) 트랜잭션 안에서 부른다.
 */

type Tx = Prisma.TransactionClient;

/** 일차가 여행 일수(박 + 1) 안인지. */
export function checkDay(nights: number, day: number): void {
  if (day > nights + 1) {
    throw new BadRequestException(
      `day는 1~${nights + 1}이어야 합니다(${nights}박 ${nights + 1}일 여행)`,
    );
  }
}

/** API의 예정 시각 → DB 값. undefined는 그대로 두고, null은 지운다. */
export function plannedTimeData(value: string | null | undefined) {
  return value == null ? value : parseLocalTime(value);
}

/** 여행의 장소를 동선 순서로. */
export function routeStops(tx: Tx, tripId: string): Promise<RouteStop[]> {
  return tx.stop.findMany({
    where: { tripId },
    select: { id: true, day: true, order: true },
    orderBy: [{ day: 'asc' }, { order: 'asc' }],
  });
}

/**
 * 동선을 [before]에서 [after]로 바꾼다. 일차·순서가 바뀐 장소만 고치고, 이웃이 바뀐 구간을 지운 뒤 새 구간을 잇는다.
 * 구간 양 끝의 유일 제약은 바로 검사해서, 지우기를 먼저 해야 같은 장소에서 나가는 구간이 겹치지 않는다.
 * 새 구간의 ID는 Prisma가 UUID v7로 만든다(@default(uuid(7))). 여행의 고친 시각도 바꾼다.
 * 새로 넣은 장소는 부르기 전에 [after]의 자리로 만들어 두고, 지운 장소는 부르기 전에 지워 둔다.
 */
export async function applyRoute(
  tx: Tx,
  tripId: string,
  before: readonly RouteStop[],
  after: readonly RouteStop[],
): Promise<TripDetailResponse> {
  const previous = new Map(before.map((stop) => [stop.id, stop]));
  for (const stop of after) {
    const old = previous.get(stop.id);
    if (old && (old.day !== stop.day || old.order !== stop.order)) {
      await tx.stop.update({
        where: { id: stop.id },
        data: { day: stop.day, order: stop.order },
      });
    }
  }

  const existing = await tx.segment.findMany({
    where: { tripId },
    select: { id: true, fromStopId: true, toStopId: true },
  });
  const { drop, create } = diffSegments(after, existing);
  if (drop.length > 0) {
    await tx.segment.deleteMany({ where: { id: { in: drop } } });
  }
  if (create.length > 0) {
    await tx.segment.createMany({
      data: create.map((pair) => ({ tripId, ...pair })),
    });
  }

  await touchTrip(tx, tripId);
  return (await readTripDetail(tx, { id: tripId }))!;
}
