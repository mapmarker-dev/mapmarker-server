import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

/**
 * 트랜잭션 안에서 내 여행 줄을 잠그고(SELECT ... FOR UPDATE) 박 수를 돌려준다. 없거나 남의 여행이면 404.
 * 기간 바꾸기와 장소 넣기·옮기기·지우기처럼 여행의 동선 규칙을 확인하고 바꾸는 요청은 이것부터 부른다.
 * 같은 여행을 두 기기에서 동시에 고쳐도 한 요청씩 차례로 처리돼서, 확인한 규칙이 커밋 전에 깨지지 않는다.
 */
export async function lockOwnedTrip(
  tx: Prisma.TransactionClient,
  userId: string,
  tripId: string,
): Promise<{ nights: number }> {
  const rows = await tx.$queryRaw<{ nights: number }[]>`
    SELECT nights FROM trips
    WHERE id = ${tripId}::uuid AND user_id = ${userId}::uuid
    FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundException();
  return rows[0];
}
