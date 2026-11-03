import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { TestingModuleBuilder } from '@nestjs/testing';
import { KakaoTokenVerifier } from '../../src/auth/social/kakao-token.verifier';
import { NaverTokenVerifier } from '../../src/auth/social/naver-token.verifier';
import {
  SocialIdentity,
  SocialTokenVerifier,
} from '../../src/auth/social/social-identity';

/**
 * 실제 카카오·네이버 대신 쓰는 가짜 검증기. 토큰 문자열로 결과를 정한다.
 * - `ok:<제공자 사용자 ID>` 또는 `ok:<ID>:<닉네임>`: 그 사용자
 * - `down`: 제공자에 닿지 못함(503)
 * - 그 밖: 틀린 토큰(401)
 */
export class FakeSocialVerifier implements SocialTokenVerifier {
  verify(token: string): Promise<SocialIdentity> {
    if (token === 'down') {
      return Promise.reject(new ServiceUnavailableException());
    }
    const [kind, providerUserId, nickname] = token.split(':');
    if (kind !== 'ok' || !providerUserId) {
      return Promise.reject(new UnauthorizedException());
    }
    return Promise.resolve({ providerUserId, nickname: nickname ?? null });
  }
}

/** 카카오·네이버 검증기를 가짜로 바꿔 끼운다. 로그인을 부르는 e2e는 모두 이것을 거친다. */
export function withFakeSocialProviders(
  builder: TestingModuleBuilder,
): TestingModuleBuilder {
  return builder
    .overrideProvider(KakaoTokenVerifier)
    .useValue(new FakeSocialVerifier())
    .overrideProvider(NaverTokenVerifier)
    .useValue(new FakeSocialVerifier());
}
