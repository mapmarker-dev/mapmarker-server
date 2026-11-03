import { generateKeyPairSync, JsonWebKey, KeyObject } from 'node:crypto';

/** 테스트용 RSA 키 한 쌍과 그 공개키의 JWK. 제공자(카카오 등) 대신 테스트가 id_token에 서명한다. */
export interface TestSigningKey {
  kid: string;
  privateKey: KeyObject;
  jwk: JsonWebKey & { kid: string };
}

export function createTestSigningKey(kid: string): TestSigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    kid,
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256' },
  };
}

/** `fetch`가 돌려줄 JSON 응답. 제공자 API 대신 쓴다. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
