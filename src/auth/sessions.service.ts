import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { TokenPairResponse } from './dto/token-pair-response.dto';
import {
  formatRefreshToken,
  hashRefreshSecret,
  newRefreshSecret,
  parseRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from './refresh-token';

/**
 * 로그인 세션(기기 하나)과 refresh 토큰. 세션마다 DB 줄 하나이고, 지금 비밀의 해시만 둔다.
 * 세션 ID는 맞는데 비밀이 다르면 이미 바뀐 예전 토큰이 다시 온 것이라 탈취로 보고 세션을 지운다.
 * 세션 ID는 토큰을 본 사람만 알 수 있어서, 예전 토큰 기록 없이도 재사용을 알아챈다.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** 새 세션을 열고 토큰 쌍을 준다(로그인). 그 사용자의 만료된 세션은 이때 치운다. */
  async start(userId: string): Promise<TokenPairResponse> {
    const now = new Date();
    await this.prisma.authSession.deleteMany({
      where: { userId, expiresAt: { lte: now } },
    });
    const secret = newRefreshSecret();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const session = await this.prisma.authSession.create({
      data: { userId, tokenHash: hashRefreshSecret(secret), expiresAt },
    });
    return this.tokenPair(userId, session.id, secret, expiresAt);
  }

  /**
   * refresh 토큰을 새 토큰 쌍으로 바꾼다. 비밀이 맞고 만료 전일 때만 조건부 UPDATE 한 번으로 바꿔서,
   * 같은 토큰이 동시에 두 번 와도 한쪽만 바뀌고 다른 쪽은 재사용으로 걸린다.
   * 틀린 이유(모양, 없음, 만료, 재사용)는 드러내지 않고 모두 401이다.
   */
  async refresh(refreshToken: string): Promise<TokenPairResponse> {
    const parts = parseRefreshToken(refreshToken);
    if (!parts) throw new UnauthorizedException();

    const now = new Date();
    const secret = newRefreshSecret();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    const [session] = await this.prisma.authSession.updateManyAndReturn({
      where: {
        id: parts.sessionId,
        tokenHash: hashRefreshSecret(parts.secret),
        expiresAt: { gt: now },
      },
      data: { tokenHash: hashRefreshSecret(secret), expiresAt },
      select: { userId: true },
    });
    if (!session) {
      // 세션이 남아 있다면 예전 비밀이 다시 왔거나(탈취 의심) 만료된 것이다. 어느 쪽이든 끊는다.
      await this.prisma.authSession.deleteMany({
        where: { id: parts.sessionId },
      });
      throw new UnauthorizedException();
    }
    return this.tokenPair(session.userId, parts.sessionId, secret, expiresAt);
  }

  /**
   * 이 기기의 세션을 지운다(로그아웃). 지금 토큰과 맞을 때만 지운다.
   * 모르는 토큰이어도 조용히 끝나서, 토큰이 맞는지 떠볼 수 없고 여러 번 불러도 결과가 같다.
   */
  async end(refreshToken: string): Promise<void> {
    const parts = parseRefreshToken(refreshToken);
    if (!parts) return;
    await this.prisma.authSession.deleteMany({
      where: {
        id: parts.sessionId,
        tokenHash: hashRefreshSecret(parts.secret),
      },
    });
  }

  private async tokenPair(
    userId: string,
    sessionId: string,
    secret: string,
    refreshExpiresAt: Date,
  ): Promise<TokenPairResponse> {
    const access = await this.auth.createAccessToken(userId);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: formatRefreshToken({ sessionId, secret }),
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    };
  }
}
