/** 휴지통에 든 여행을 지우기 전까지 두는 날 수. 앱은 응답의 purgeAt만 보고 이 값을 따로 갖지 않는다. */
export const TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 휴지통에 넣은 시각 → 지울 시각. */
export function purgeAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * DAY_MS);
}

/** 이 시각까지(같은 시각 포함) 휴지통에 넣은 여행은 보관 기간이 끝났다. 예약 삭제를 기다리는 동안에도 없는 여행으로 본다. */
export function trashCutoff(now: Date): Date {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS);
}
