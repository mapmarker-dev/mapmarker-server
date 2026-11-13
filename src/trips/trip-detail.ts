import type { Prisma } from '../generated/prisma/client';
import {
  toTripDetailResponse,
  TripDetailResponse,
} from './dto/trip-detail-response.dto';

/** 후보를 보여 주는 순서: 넣은 순서. 같은 시각이면 ID(UUID v7도 만든 순서다). */
export const CANDIDATE_ORDER = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.CandidateOrderByWithRelationInput[];

/** 여행 하나와 그 동선(장소는 일차·순서대로)과 후보(넣은 순서대로). 없으면 null. 트랜잭션 안에서도 부른다. */
export async function readTripDetail(
  db: Prisma.TransactionClient,
  where: Prisma.TripWhereInput,
): Promise<TripDetailResponse | null> {
  const trip = await db.trip.findFirst({
    where,
    include: {
      stops: { orderBy: [{ day: 'asc' }, { order: 'asc' }] },
      segments: true,
      candidates: { orderBy: CANDIDATE_ORDER },
    },
  });
  if (!trip) return null;
  const { stops, segments, candidates, ...fields } = trip;
  return toTripDetailResponse(fields, stops, segments, candidates);
}
