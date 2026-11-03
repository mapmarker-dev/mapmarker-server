import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Env } from '../../config/env';
import { RemoteJwks } from './remote-jwks';
import {
  normalizeNickname,
  SocialIdentity,
  SocialTokenVerifier,
} from './social-identity';

export const KAKAO_ISSUER = 'https://kauth.kakao.com';
export const KAKAO_JWKS_URL = 'https://kauth.kakao.com/.well-known/jwks.json';

interface KakaoIdTokenPayload {
  sub?: unknown;
  nickname?: unknown;
}

/**
 * 카카오 로그인. 앱이 카카오 SDK로 받은 id_token(OpenID Connect)을 검증한다.
 *
 * id_token은 "이 사용자를 이 앱(aud)을 위해 인증했다"는 내용에 카카오가 RSA로 서명한 JWT다.
 * 카카오 공개키로 서명을 확인하고 iss·aud·exp를 보면 되어서, 로그인마다 카카오 API를 부르지 않는다.
 * aud(우리 네이티브 앱 키)를 봐야 다른 앱을 위해 발급된 토큰을 막는다.
 * nonce는 쓰지 않는다(토큰은 HTTPS로 우리 앱에서 우리 서버로만 간다). Apple을 붙일 때 다시 본다.
 */
@Injectable()
export class KakaoTokenVerifier implements SocialTokenVerifier {
  /** access 토큰용 JwtService(HS256 비밀키)와 섞이지 않게 따로 둔다. */
  private readonly jwt = new JwtService();
  /** 공개키는 서버가 떠 있는 동안 기억해 둔다(검증기는 하나만 만들어진다). */
  private readonly jwks = new RemoteJwks(KAKAO_JWKS_URL);
  private readonly appKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.appKey = config.get('KAKAO_NATIVE_APP_KEY', { infer: true });
  }

  async verify(idToken: string): Promise<SocialIdentity> {
    const decoded = this.jwt.decode<{
      header?: { alg?: unknown; kid?: unknown };
    } | null>(idToken, { complete: true });
    const header = decoded?.header;
    // 카카오 id_token은 RS256으로 고정이다. 다른 알고리즘(none, HS256)은 키를 찾기 전에 막는다.
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string') {
      throw new UnauthorizedException();
    }

    const publicKey = await this.jwks.getKey(header.kid);
    if (!publicKey) throw new UnauthorizedException();

    let payload: KakaoIdTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<KakaoIdTokenPayload>(idToken, {
        publicKey,
        algorithms: ['RS256'],
        issuer: KAKAO_ISSUER,
        audience: this.appKey,
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      throw new UnauthorizedException();
    }
    return {
      providerUserId: payload.sub,
      nickname: normalizeNickname(payload.nickname),
    };
  }
}
