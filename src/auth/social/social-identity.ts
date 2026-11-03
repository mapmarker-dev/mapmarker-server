/** 닉네임 상한. DB CHECK(users_nickname_length_check)와 같다. */
export const NICKNAME_MAX_LENGTH = 30;

/** 제공자 토큰을 검증해서 알아낸 사용자. */
export interface SocialIdentity {
  /** 제공자가 준 사용자 ID. 제공자마다 앱별로 다른 값이다. */
  providerUserId: string;
  /** 사용자가 닉네임 제공에 동의했을 때만 있다. */
  nickname: string | null;
}

/**
 * 제공자 토큰 검증기. 제공자를 더할 때 이것을 하나 더 만든다.
 * 토큰이 틀리면 `UnauthorizedException`(401), 제공자에 닿지 못하면 `ServiceUnavailableException`(503)을 던진다.
 * 둘을 나눠야 앱이 "다시 로그인"과 "잠시 후 다시"를 구분해서 보여 준다.
 */
export interface SocialTokenVerifier {
  verify(token: string): Promise<SocialIdentity>;
}

/** 제공자 닉네임을 저장할 모양으로. 앞뒤 공백을 떼고 30자(코드 포인트)로 자른다. 비면 null. */
export function normalizeNickname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // 문자열 길이(UTF-16)로 자르면 이모지가 반으로 갈려 깨진다. DB의 char_length처럼 코드 포인트로 센다.
  return Array.from(trimmed).slice(0, NICKNAME_MAX_LENGTH).join('');
}
