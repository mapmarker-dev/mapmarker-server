import {
  formatRefreshToken,
  hashRefreshSecret,
  newRefreshSecret,
  parseRefreshToken,
} from './refresh-token';

describe('refresh 토큰', () => {
  const sessionId = '0192f0c2-7a3b-7c4d-8e5f-0123456789ab';

  it('비밀은 base64url 43자이고 매번 다르다', () => {
    const [a, b] = [newRefreshSecret(), newRefreshSecret()];

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('만든 토큰을 나누면 세션 ID와 비밀이 그대로 나온다', () => {
    const secret = newRefreshSecret();
    const token = formatRefreshToken({ sessionId, secret });

    expect(parseRefreshToken(token)).toEqual({ sessionId, secret });
  });

  it('모양이 틀리면 null', () => {
    const secret = newRefreshSecret();

    for (const token of [
      '',
      'abc',
      sessionId,
      `${sessionId}.`,
      `.${secret}`,
      `${sessionId}.${secret}.x`,
      // v4 UUID: 서버가 만든 세션 ID(v7)가 아니다.
      `0192f0c2-7a3b-4c4d-8e5f-0123456789ab.${secret}`,
      `${sessionId}.${secret.slice(1)}`,
      `${sessionId}.${secret.slice(1)}+`,
    ]) {
      expect(parseRefreshToken(token)).toBeNull();
    }
  });

  it('해시는 SHA-256 32바이트이고, 같은 비밀이면 같다', () => {
    const secret = newRefreshSecret();

    expect(hashRefreshSecret(secret)).toHaveLength(32);
    expect(hashRefreshSecret(secret)).toEqual(hashRefreshSecret(secret));
    expect(hashRefreshSecret(secret)).not.toEqual(
      hashRefreshSecret(newRefreshSecret()),
    );
  });
});
