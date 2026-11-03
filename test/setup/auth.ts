import { INestApplication } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { TokenPairResponse } from '../../src/auth/dto/token-pair-response.dto';
import { SessionsService } from '../../src/auth/sessions.service';
import { PrismaService } from '../../src/prisma/prisma.service';

/** 테스트 사용자를 DB에 만들고, 서버가 서명한 access 토큰을 함께 돌려준다. */
export async function createUserWithToken(
  app: INestApplication,
): Promise<{ userId: string; token: string }> {
  const user = await app.get(PrismaService).user.create({ data: {} });
  const token = await app.get(AuthService).signAccessToken(user.id);
  return { userId: user.id, token };
}

/** 테스트 사용자를 만들고 로그인한 것처럼 세션을 연다(소셜 로그인 없이 refresh 토큰을 받는다). */
export async function createUserWithSession(
  app: INestApplication,
): Promise<{ userId: string } & TokenPairResponse> {
  const user = await app.get(PrismaService).user.create({ data: {} });
  const tokens = await app.get(SessionsService).start(user.id);
  return Object.assign({ userId: user.id }, tokens);
}

/** `Authorization` 헤더 값. */
export function bearer(token: string): string {
  return `Bearer ${token}`;
}
