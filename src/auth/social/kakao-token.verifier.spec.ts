import { createHmac, createPublicKey } from 'node:crypto';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createTestSigningKey,
  jsonResponse,
  TestSigningKey,
} from '../../../test/setup/signing-keys';
import { Env } from '../../config/env';
import {
  KAKAO_ISSUER,
  KAKAO_JWKS_URL,
  KakaoTokenVerifier,
} from './kakao-token.verifier';

describe('KakaoTokenVerifier', () => {
  const appKey = 'test-kakao-native-app-key';
  const kakaoKey = createTestSigningKey('kakao-key-1');
  const jwt = new JwtService();
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  const config = {
    get: () => appKey,
  } as unknown as ConfigService<Env, true>;

  /** 카카오가 서명한 것처럼 만든 id_token. */
  function idToken(
    payload: Record<string, unknown> = {},
    options: { key?: TestSigningKey; expiresIn?: number } = {},
  ): string {
    const key = options.key ?? kakaoKey;
    return jwt.sign(
      { sub: '1234567890', nickname: '여행자', ...payload },
      {
        algorithm: 'RS256',
        privateKey: key.privateKey,
        keyid: key.kid,
        issuer: KAKAO_ISSUER,
        audience: appKey,
        expiresIn: options.expiresIn ?? 2 * 60 * 60,
      },
    );
  }

  /** base64url로 바꾼 JSON. 서명이 없거나 틀린 토큰을 직접 만들 때 쓴다. */
  function encode(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  beforeEach(() => {
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ keys: [kakaoKey.jwk] })),
      );
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('카카오 공개키로 서명을 확인하고 sub와 닉네임을 돌려준다', async () => {
    const verifier = new KakaoTokenVerifier(config);

    await expect(verifier.verify(idToken())).resolves.toEqual({
      providerUserId: '1234567890',
      nickname: '여행자',
    });
    expect(fetchMock).toHaveBeenCalledWith(KAKAO_JWKS_URL, expect.anything());
  });

  it('공개키는 한 번 받아 두고 다음 로그인에는 카카오를 부르지 않는다', async () => {
    const verifier = new KakaoTokenVerifier(config);

    await verifier.verify(idToken());
    await verifier.verify(idToken({ sub: '42' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('닉네임에 동의하지 않았으면 null, 길면 30자로 자른다', async () => {
    const verifier = new KakaoTokenVerifier(config);

    await expect(
      verifier.verify(idToken({ nickname: undefined })),
    ).resolves.toMatchObject({ nickname: null });
    await expect(
      verifier.verify(idToken({ nickname: `  ${'가'.repeat(40)} ` })),
    ).resolves.toMatchObject({ nickname: '가'.repeat(30) });
  });

  it('다른 앱(aud)을 위한 토큰은 401', async () => {
    const token = jwt.sign(
      { sub: '1' },
      {
        algorithm: 'RS256',
        privateKey: kakaoKey.privateKey,
        keyid: kakaoKey.kid,
        issuer: KAKAO_ISSUER,
        audience: 'other-app-key',
        expiresIn: 60,
      },
    );

    await expect(
      new KakaoTokenVerifier(config).verify(token),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('발급자(iss)가 카카오가 아니면 401', async () => {
    const token = jwt.sign(
      { sub: '1' },
      {
        algorithm: 'RS256',
        privateKey: kakaoKey.privateKey,
        keyid: kakaoKey.kid,
        issuer: 'https://evil.test',
        audience: appKey,
        expiresIn: 60,
      },
    );

    await expect(
      new KakaoTokenVerifier(config).verify(token),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('만료된 토큰은 401', async () => {
    const token = idToken({}, { expiresIn: -10 });

    await expect(
      new KakaoTokenVerifier(config).verify(token),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('같은 kid라도 다른 키로 서명했으면 401', async () => {
    const forged = createTestSigningKey(kakaoKey.kid);

    await expect(
      new KakaoTokenVerifier(config).verify(idToken({}, { key: forged })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('카카오 공개키 목록에 없는 kid는 401', async () => {
    const unknown = createTestSigningKey('unknown-kid');

    await expect(
      new KakaoTokenVerifier(config).verify(idToken({}, { key: unknown })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('서명이 없는 alg: none 토큰은 401', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = [
      encode({ alg: 'none', typ: 'JWT', kid: kakaoKey.kid }),
      encode({ sub: '1', iss: KAKAO_ISSUER, aud: appKey, exp: now + 60 }),
      '',
    ].join('.');

    await expect(
      new KakaoTokenVerifier(config).verify(token),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('공개키를 HS256 비밀키처럼 써서 만든 위조 토큰은 401', async () => {
    // 공개키는 누구나 받을 수 있다. 서버가 토큰의 alg를 믿고 공개키를 HMAC 비밀키로 쓰면 이 서명이 통과한다.
    const publicPem = createPublicKey({ key: kakaoKey.jwk, format: 'jwk' })
      .export({ type: 'spki', format: 'pem' })
      .toString();
    const now = Math.floor(Date.now() / 1000);
    const signingInput = [
      encode({ alg: 'HS256', typ: 'JWT', kid: kakaoKey.kid }),
      encode({ sub: '1', iss: KAKAO_ISSUER, aud: appKey, exp: now + 60 }),
    ].join('.');
    const signature = createHmac('sha256', publicPem)
      .update(signingInput)
      .digest('base64url');

    await expect(
      new KakaoTokenVerifier(config).verify(`${signingInput}.${signature}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sub가 없으면 401', async () => {
    await expect(
      new KakaoTokenVerifier(config).verify(idToken({ sub: undefined })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('토큰 모양이 아니면 카카오를 부르지 않고 401', async () => {
    await expect(
      new KakaoTokenVerifier(config).verify('not-a-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('카카오 공개키를 받지 못하면 503', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      new KakaoTokenVerifier(config).verify(idToken()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
