import { ValidateBy, ValidationOptions } from 'class-validator';

/**
 * 시간대 없는 날짜. API는 "2026-10-15" 문자열로 주고받고, DB(@db.Date)는 그날 UTC 0시 Date로 오간다.
 * 서버 시간대와 관계없이 같은 날짜가 되도록 계산은 모두 UTC로 한다.
 */
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-15" 형식이고 달력에 있는 날인지. 2026-02-30처럼 없는 날은 아니다. */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !LOCAL_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  // Date는 없는 날을 다음 달로 넘겨 버리므로, 다시 문자열로 바꿔 같은지 본다.
  return !Number.isNaN(date.getTime()) && formatLocalDate(date) === value;
}

/** "2026-10-15" → 그날 UTC 0시 Date. 형식이 틀리거나 없는 날이면 RangeError. */
export function parseLocalDate(value: string): Date {
  if (!isLocalDate(value)) {
    throw new RangeError(`날짜가 아닙니다: ${JSON.stringify(value)}`);
  }
  return new Date(`${value}T00:00:00Z`);
}

/** DB에서 읽은 날짜(UTC 0시 Date) → "2026-10-15". */
export function formatLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** start에서 end까지 며칠인지(박 수). end가 앞이면 음수다. */
export function daysBetween(start: string, end: string): number {
  return Math.round(
    (parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / DAY_MS,
  );
}

/** DTO 필드가 "2026-10-15" 형식의 날짜인지 검사한다. */
export function IsLocalDate(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isLocalDate',
      validator: {
        validate: (value) => isLocalDate(value),
        defaultMessage: (args) =>
          `${args?.property}는 "2026-10-15" 형식의 날짜여야 합니다`,
      },
    },
    options,
  );
}
