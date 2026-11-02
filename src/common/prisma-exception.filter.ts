import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client';

/**
 * 서비스가 미리 확인하지 않은 Prisma 오류 중 뜻이 분명한 것만 HTTP 오류로 바꾼다.
 * - P2002 유일 제약 위반 → 409. 예: 앱이 만든 ID가 이미 있다.
 * - P2025 고칠·지울 대상이 없다 → 404.
 * 그 밖의 오류(FK·CHECK 위반 등)는 서비스가 막았어야 하는 버그라서 그대로 500으로 두고 로그에 남긴다.
 * 트랜잭션 커밋 때 걸린 미룬 유일 제약은 Prisma 오류가 아니라 DriverAdapterError로 와서 여기에 오지 않는다(500).
 */
export function toHttpException(
  error: Prisma.PrismaClientKnownRequestError,
): HttpException | undefined {
  switch (error.code) {
    case 'P2002':
      return new ConflictException('이미 있는 값입니다');
    case 'P2025':
      return new NotFoundException();
    default:
      return undefined;
  }
}

/** 전역 필터. `configureApp`이 등록한다. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    super.catch(toHttpException(error) ?? error, host);
  }
}
