import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from './access-token';
import { AuthUser } from './auth-user';
import { MeResponse } from './dto/me-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** 사용자의 access 토큰을 만든다. */
  signAccessToken(userId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId };
    return this.jwt.signAsync(payload);
  }

  /**
   * 서명과 만료를 확인하고 사용자를 돌려준다. DB는 보지 않는다.
   * 틀린 이유(서명, 만료, 모양)는 응답에 드러내지 않고 모두 401로 묶는다.
   */
  async verifyAccessToken(token: string): Promise<AuthUser> {
    let payload: Partial<AccessTokenPayload>;
    try {
      payload = await this.jwt.verifyAsync<Partial<AccessTokenPayload>>(token);
    } catch {
      throw new UnauthorizedException();
    }
    // 서명이 맞아도 sub가 UUID가 아니면 DB 쿼리에서 500이 나니 여기서 막는다.
    if (typeof payload.sub !== 'string' || !isUUID(payload.sub)) {
      throw new UnauthorizedException();
    }
    return { id: payload.sub };
  }

  /** 토큰의 사용자. 토큰은 맞아도 탈퇴해서 없는 사용자면 401이다. */
  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return { id: user.id, createdAt: user.createdAt.toISOString() };
  }
}
