import type { Prisma } from '../generated/prisma/client';

/** 장소·구간이 바뀌면 여행도 고친 것으로 본다. 여행 목록이 최근에 고친 순서라서다(앱 저장소와 같다). */
export async function touchTrip(
  tx: Prisma.TransactionClient,
  tripId: string,
): Promise<void> {
  await tx.trip.update({
    where: { id: tripId },
    data: { updatedAt: new Date() },
  });
}
