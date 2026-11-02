import { ValidateIf } from 'class-validator';

/**
 * 보내지 않아도 되지만, 보내면 null은 안 되는 필드(PATCH의 제목·박 수 등).
 * `@IsOptional()`은 null도 건너뛰어서, null이 DB까지 가서 500이 난다. 이것은 undefined만 건너뛴다.
 * null로 지울 수 있는 필드(기간·직접 바꾼 상태)는 `@IsOptional()`을 쓴다.
 */
export const CanOmit = () =>
  ValidateIf((_object: object, value: unknown) => value !== undefined);
