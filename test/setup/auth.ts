import { INestApplication } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/** 테스트 사용자를 DB에 만들고, 서버가 서명한 access 토큰을 함께 돌려준다. */
export async function createUserWithToken(
  app: INestApplication,
): Promise<{ userId: string; token: string }> {
  const user = await app.get(PrismaService).user.create({ data: {} });
  const token = await app.get(AuthService).signAccessToken(user.id);
  return { userId: user.id, token };
}

/** `Authorization` 헤더 값. */
export function bearer(token: string): string {
  return `Bearer ${token}`;
}
