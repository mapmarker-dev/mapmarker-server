import { Injectable } from '@nestjs/common';
import { Prisma, User } from '../generated/prisma/client';
import { SocialProvider } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { LoginResponse } from './dto/login-response.dto';
import { toMeResponse } from './dto/me-response.dto';
import { SessionsService } from './sessions.service';
import { KakaoTokenVerifier } from './social/kakao-token.verifier';
import { NaverTokenVerifier } from './social/naver-token.verifier';
import { SocialIdentity, SocialTokenVerifier } from './social/social-identity';

/**
 * 소셜 로그인: 제공자 토큰 검증 → 소셜 계정으로 사용자 찾기(없으면 만들기) → 로그인 세션 열기.
 * 아이디·비밀번호 로그인은 없다. 운영에서 토큰을 얻는 길은 이것뿐이다.
 *
 * - 같은 사람이 카카오와 네이버로 따로 들어오면 서로 다른 사용자다(이메일을 받지 않아 이을 근거가 없다).
 * - 닉네임은 가입할 때만 넣는다. 다음 로그인에서 제공자 닉네임이 바뀌어도 덮어쓰지 않는다.
 * - 제공자를 더하려면 검증기를 만들어 `verifiers`에 넣고, enum과 경로·DTO를 더한다.
 */
@Injectable()
export class SocialLoginService {
  private readonly verifiers: Record<SocialProvider, SocialTokenVerifier>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    kakao: KakaoTokenVerifier,
    naver: NaverTokenVerifier,
  ) {
    this.verifiers = { kakao, naver };
  }

  async login(provider: SocialProvider, token: string): Promise<LoginResponse> {
    const identity = await this.verifiers[provider].verify(token);
    const { user, isNewUser } = await this.findOrCreateUser(provider, identity);
    const tokens = await this.sessions.start(user.id);
    return {
      accessToken: tokens.accessToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      isNewUser,
      user: toMeResponse(user),
    };
  }

  /**
   * 소셜 계정의 사용자. 없으면 사용자와 소셜 계정을 한 번에 만든다(중첩 create는 한 트랜잭션).
   * 같은 사람의 첫 로그인이 동시에 두 번 오면 한쪽은 유일 제약에 걸린다. 그때는 먼저 만든 쪽을 다시 읽는다.
   */
  private async findOrCreateUser(
    provider: SocialProvider,
    { providerUserId, nickname }: SocialIdentity,
  ): Promise<{ user: User; isNewUser: boolean }> {
    const existing = await this.findUser(provider, providerUserId);
    if (existing) return { user: existing, isNewUser: false };

    try {
      const user = await this.prisma.user.create({
        data: {
          nickname,
          socialAccounts: { create: { provider, providerUserId } },
        },
      });
      return { user, isNewUser: true };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findUser(provider, providerUserId);
        if (raced) return { user: raced, isNewUser: false };
      }
      throw error;
    }
  }

  private async findUser(
    provider: SocialProvider,
    providerUserId: string,
  ): Promise<User | null> {
    const account = await this.prisma.socialAccount.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      include: { user: true },
    });
    return account?.user ?? null;
  }
}
