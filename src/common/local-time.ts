/**
 * 시간대 없는 시:분. API는 "09:30" 문자열로 주고받고, DB(@db.Time(0))는 1970-01-01 UTC 기준 Date로 오간다.
 */

/** DB에서 읽은 시각 → "09:30". */
export function formatLocalTime(time: Date): string {
  return time.toISOString().slice(11, 16);
}
