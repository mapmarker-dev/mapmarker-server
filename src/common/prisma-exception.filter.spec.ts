import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { toHttpException } from './prisma-exception.filter';

describe('toHttpException', () => {
  function prismaError(code: string) {
    return new Prisma.PrismaClientKnownRequestError('오류', {
      code,
      clientVersion: 'test',
    });
  }

  it('유일 제약 위반(P2002)은 409', () => {
    expect(toHttpException(prismaError('P2002'))).toBeInstanceOf(
      ConflictException,
    );
  });

  it('고칠·지울 대상이 없으면(P2025) 404', () => {
    expect(toHttpException(prismaError('P2025'))).toBeInstanceOf(
      NotFoundException,
    );
  });

  it('그 밖의 오류(FK·CHECK 위반 등)는 바꾸지 않는다 (서비스가 놓친 버그라 500)', () => {
    for (const code of ['P2003', 'P2039']) {
      expect(toHttpException(prismaError(code))).toBeUndefined();
    }
  });
});
