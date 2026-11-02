import type { Prisma } from '../generated/prisma/client';
import {
  toTripDetailResponse,
  TripDetailResponse,
} from './dto/trip-detail-response.dto';

/** 여행 하나와 그 동선(장소는 일차·순서대로). 없으면 null. 트랜잭션 안에서도 부른다. */
export async function readTripDetail(
  db: Prisma.TransactionClient,
  where: Prisma.TripWhereInput,
): Promise<TripDetailResponse | null> {
  const trip = await db.trip.findFirst({
    where,
    include: {
      stops: { orderBy: [{ day: 'asc' }, { order: 'asc' }] },
      segments: true,
    },
  });
  if (!trip) return null;
  const { stops, segments, ...fields } = trip;
  return toTripDetailResponse(fields, stops, segments);
}
