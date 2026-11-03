import { createHash, randomBytes } from 'node:crypto';
import { isUUID } from 'class-validator';

/**
 * refresh 토큰(로그인 세션) 유효 기간. 토큰을 바꿀 때마다 지금부터 다시 센다.
 * 그래서 한 달 안에 한 번이라도 앱을 쓰면 로그인이 이어진다.
 */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 비밀 부분의 길이. 256비트 무작위 값이라 맞혀 볼 수 없다. */
const SECRET_BYTES = 32;
/** base64url로 쓴 32바이트(43자, 채움 문자 없음). */
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * refresh 토큰 `<세션 ID>.<비밀>`을 나눈 것.
 * 세션 ID로 DB 줄을 바로 찾고, 비밀은 해시로만 비교한다. JWT가 아니라서 내용을 읽을 수 없다.
 */
export interface RefreshTokenParts {
  sessionId: string;
  secret: string;
}

/** 새 비밀. */
export function newRefreshSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

/**
 * DB에 두는 비밀의 해시(SHA-256, 32바이트).
 * 비밀이 무작위 256비트라 bcrypt처럼 느린 해시가 필요 없다. 같은 값이 나와야 DB에서 바로 비교할 수 있다.
 */
export function hashRefreshSecret(secret: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(secret).digest());
}

export function formatRefreshToken({
  sessionId,
  secret,
}: RefreshTokenParts): string {
  return `${sessionId}.${secret}`;
}

/** 모양이 틀리면 null. 이유는 따지지 않고 호출한 쪽이 401로 묶는다. */
export function parseRefreshToken(token: string): RefreshTokenParts | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [sessionId, secret] = parts;
  if (!isUUID(sessionId, '7') || !SECRET_PATTERN.test(secret)) return null;
  return { sessionId, secret };
}
