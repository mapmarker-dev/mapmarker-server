import { JwtModuleOptions } from '@nestjs/jwt';

/** access 토큰 유효 시간. 도둑맞아도 쓸 수 있는 시간을 줄이려고 짧게 둔다. 재발급은 refresh 토큰이 맡는다. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * access 토큰 내용. JWT 내용은 누구나 읽을 수 있어서 사용자 ID(sub)만 담는다.
 * iat(발급 시각)·exp(만료 시각)는 서명할 때 붙는다.
 */
export interface AccessTokenPayload {
  sub: string;
}

/**
 * 서명·검사 옵션. 서버(AuthModule)와 개발용 토큰 스크립트가 같이 쓴다.
 * 검사할 때 알고리즘을 HS256 하나로 고정해서, 서명 없는 `alg: none` 같은 토큰을 받지 않는다.
 */
export function jwtModuleOptions(secret: string): JwtModuleOptions {
  return {
    secret,
    signOptions: { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    verifyOptions: { algorithms: ['HS256'] },
  };
}
