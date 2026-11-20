import { BadRequestException } from '@nestjs/common';

/**
 * 방문 체크. API는 방문 시각(visitedAt)만 받고 방문 여부(visited)는 그 시각이 있는지로 맞춘다.
 * 시각은 앱이 정한다(누른 순간, 또는 사용자가 고친 날짜와 시각). 어느 현지 시각으로 보일지는 장소의 timeZone이 정한다.
 */

/** 서버 시각보다 이만큼 넘게 뒤인 방문 시각은 받지 않는다. 기기 시계가 조금 틀린 것은 봐준다. */
export const VISIT_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * PATCH 본문의 visitedAt → DB 값. 보내지 않았으면(undefined) 둘 다 그대로, null이면 방문 취소다.
 * 하루 넘게 미래면 400이다.
 */
export function visitData(
  visitedAt: string | null | undefined,
  now: Date,
): { visited: boolean; visitedAt: Date | null } | undefined {
  if (visitedAt === undefined) return undefined;
  if (visitedAt === null) return { visited: false, visitedAt: null };
  const at = new Date(visitedAt);
  if (at.getTime() - now.getTime() > VISIT_FUTURE_TOLERANCE_MS) {
    throw new BadRequestException(
      'visitedAt이 서버 시각보다 하루 넘게 뒤입니다',
    );
  }
  return { visited: true, visitedAt: at };
}
