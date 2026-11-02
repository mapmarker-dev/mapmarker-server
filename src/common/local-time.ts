import { ValidateBy, ValidationOptions } from 'class-validator';

/**
 * 시간대 없는 시:분. API는 "09:30" 문자열로 주고받고, DB(@db.Time(0))는 1970-01-01 UTC 기준 Date로 오간다.
 * 어느 시간대의 시각인지는 장소의 timeZone이 정한다.
 */
const LOCAL_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 00:00~23:59의 "09:30" 형식인지. */
export function isLocalTime(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_TIME.test(value);
}

/** "09:30" → DB 시각. 형식이 틀리면 RangeError. */
export function parseLocalTime(value: string): Date {
  if (!isLocalTime(value)) {
    throw new RangeError(`시각이 아닙니다: ${JSON.stringify(value)}`);
  }
  return new Date(`1970-01-01T${value}:00Z`);
}

/** DB에서 읽은 시각 → "09:30". */
export function formatLocalTime(time: Date): string {
  return time.toISOString().slice(11, 16);
}

/** DTO 필드가 "09:30" 형식의 시각인지 검사한다. */
export function IsLocalTime(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isLocalTime',
      validator: {
        validate: (value) => isLocalTime(value),
        defaultMessage: (args) =>
          `${args?.property}은 "09:30" 형식의 시각이어야 합니다`,
      },
    },
    options,
  );
}
