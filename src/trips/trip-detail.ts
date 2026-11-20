import type { Prisma } from '../generated/prisma/client';
import {
  toTripDetailResponse,
  TripDetailResponse,
} from './dto/trip-detail-response.dto';
import type { PhotoLinks } from './photo-links';

/** 후보를 보여 주는 순서: 넣은 순서. 같은 시각이면 ID(UUID v7도 만든 순서다). */
export const CANDIDATE_ORDER = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.CandidateOrderByWithRelationInput[];

/** 사진 순서: 올린 순서. 장소마다 1장이라 지금은 첫 사진만 보인다. */
export const PHOTO_ORDER = [
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.PhotoOrderByWithRelationInput[];

/**
 * 여행 하나와 그 동선(장소는 일차·순서대로, 사진 주소와 함께)과 후보(넣은 순서대로). 없으면 null.
 * 트랜잭션 안에서도 부른다.
 */
export async function readTripDetail(
  db: Prisma.TransactionClient,
  where: Prisma.TripWhereInput,
  links: PhotoLinks,
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
  const photos = await db.photo.findMany({
    where: { stop: { tripId: trip.id } },
    orderBy: PHOTO_ORDER,
    select: { id: true, stopId: true, storageKey: true },
  });
  return toTripDetailResponse(
    fields,
    stops,
    segments,
    candidates,
    await links.byStop(photos),
  );
}
