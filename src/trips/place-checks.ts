import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { MapProvider } from '../generated/prisma/enums';

/** 장소 서비스 ID는 어느 서비스의 것인지 함께 있어야 쓸 수 있다. 둘 다 있거나 둘 다 없다. 장소와 후보가 같이 쓴다. */
export function checkPlace(
  provider: MapProvider | null | undefined,
  placeId: string | null | undefined,
): void {
  if ((provider == null) !== (placeId == null)) {
    throw new BadRequestException(
      'placeProvider와 placeId는 둘 다 있거나 둘 다 없어야 합니다',
    );
  }
}

/**
 * 장소와 후보는 동선에 넣기·후보로 빼기로 같은 ID를 주고받아서, 한 ID가 두 테이블에 함께 있으면 안 된다.
 * 새 장소·후보를 넣기 전에 다른 쪽 테이블에 그 ID가 있으면 409다(같은 테이블의 중복은 DB의 기본 키가 막는다).
 * 앱이 만든 UUID v7이라 겹치는 일은 다시 보내기·잘못된 요청뿐이다. 여행 줄을 잠근 트랜잭션에서 부른다.
 */
export async function ensureNotStop(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  if (await tx.stop.findUnique({ where: { id }, select: { id: true } })) {
    throw new ConflictException('같은 ID의 장소가 있습니다');
  }
}

/** [ensureNotStop]의 반대쪽. 장소를 넣기 전에 같은 ID의 후보가 있으면 409다. */
export async function ensureNotCandidate(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<void> {
  if (await tx.candidate.findUnique({ where: { id }, select: { id: true } })) {
    throw new ConflictException('같은 ID의 후보가 있습니다');
  }
}
