import {
  applyDecorators,
  BadRequestException,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiParam, ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * 앱이 만든 ID(UUID v7)를 받는 곳에 쓴다. 여행·장소·구간·사진 ID가 모두 v7이다.
 * Swagger 기본 예시는 v4라서 그대로 보내면 400이 나므로, 예시를 v7로 바꿔 둔다.
 * 예시 값으로 두 번 만들면 두 번째는 409다(이미 있는 ID).
 */
export const APP_ID_EXAMPLE = '019a3c52-8d4e-7b21-9f3a-5c6d7e8f9a0b';

function message(name: string): string {
  return `${name}는 앱이 만든 UUID v7이어야 합니다`;
}

/** 요청 본문의 앱 ID 필드: 검사(v7)와 Swagger 예시. */
export const IsAppId = (description = '앱이 만든 UUID v7') =>
  applyDecorators(
    ApiProperty({ format: 'uuid', example: APP_ID_EXAMPLE, description }),
    IsUUID('7', { message: ({ property }) => message(property) }),
  );

/** 응답의 ID 필드 Swagger 표시. 응답에서도 예시를 v7로 맞춰, 복사해 쓸 때 헷갈리지 않게 한다. */
export const ApiIdProperty = (nullable = false) =>
  ApiProperty({
    type: String,
    format: 'uuid',
    example: APP_ID_EXAMPLE,
    nullable,
  });

/** 경로의 앱 ID 파라미터. v7이 아니면 400. 메서드에는 `@ApiAppIdParam(name)`도 단다. */
export const AppIdParam = (name: string) =>
  Param(
    name,
    new ParseUUIDPipe({
      version: '7',
      exceptionFactory: () => new BadRequestException(message(name)),
    }),
  );

/** 경로 파라미터의 Swagger 예시. 파라미터 데코레이터는 Swagger 정보를 못 달아서 메서드에 따로 단다. */
export const ApiAppIdParam = (name: string) =>
  ApiParam({ name, format: 'uuid', example: APP_ID_EXAMPLE });
