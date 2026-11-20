import { isISO8601, ValidateBy, ValidationOptions } from 'class-validator';

/**
 * 순간(시각). API는 시간대가 붙은 ISO 8601 문자열로 받고(예: "2026-10-21T05:42:00.000Z"), 응답은 UTC로 준다.
 * 시간대가 없으면 서버 시간대로 읽혀 틀어지므로 받지 않는다. 어느 현지 시각으로 보일지는 장소의 timeZone이 정한다.
 */
const WITH_OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

/** 있는 날짜이고 시간대(Z나 +09:00)가 붙은 ISO 8601 날짜·시각인지. */
export function isInstant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.includes('T') &&
    WITH_OFFSET.test(value) &&
    isISO8601(value, { strict: true, strictSeparator: true })
  );
}

/** DTO 필드가 시간대가 붙은 ISO 8601 순간인지 검사한다. */
export function IsInstant(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isInstant',
      validator: {
        validate: (value) => isInstant(value),
        defaultMessage: (args) =>
          `${args?.property}은 시간대가 붙은 ISO 8601 시각이어야 합니다(예: 2026-10-21T05:42:00Z)`,
      },
    },
    options,
  );
}
