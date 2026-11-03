import { ServiceUnavailableException } from '@nestjs/common';
import { RemoteJwks } from './remote-jwks';
import {
  createTestSigningKey,
  jsonResponse,
} from '../../../test/setup/signing-keys';

describe('RemoteJwks', () => {
  const url = 'https://provider.test/jwks.json';
  const keyA = createTestSigningKey('a');
  const keyB = createTestSigningKey('b');
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let now: number;

  function jwksWith() {
    return new RemoteJwks(url, {
      maxAgeMs: 60 * 60 * 1000,
      refetchCooldownMs: 60 * 1000,
      now: () => now,
    });
  }

  beforeEach(() => {
    now = 1_000_000;
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('kid의 공개키를 PEM으로 꺼내고, 받아 둔 동안은 다시 받지 않는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ keys: [keyA.jwk] }));
    const jwks = jwksWith();

    const pem = await jwks.getKey('a');
    await jwks.getKey('a');

    expect(pem).toContain('BEGIN PUBLIC KEY');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(url);
  });

  it('동시에 여러 번 불러도 한 번만 받는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ keys: [keyA.jwk] }));
    const jwks = jwksWith();

    await Promise.all([jwks.getKey('a'), jwks.getKey('a'), jwks.getKey('a')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('유효 시간이 지나면 다시 받는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ keys: [keyA.jwk] }));
    const jwks = jwksWith();
    await jwks.getKey('a');

    now += 60 * 60 * 1000;
    fetchMock.mockResolvedValue(jsonResponse({ keys: [keyA.jwk] }));
    await jwks.getKey('a');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('모르는 kid면 다시 받아서 새로 바뀐 키를 찾는다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ keys: [keyA.jwk] }));
    const jwks = jwksWith();
    await jwks.getKey('a');

    now += 60 * 1000;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ keys: [keyA.jwk, keyB.jwk] }),
    );

    expect(await jwks.getKey('b')).toContain('BEGIN PUBLIC KEY');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('모르는 kid가 연달아 와도 1분에 한 번만 다시 받는다', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ keys: [keyA.jwk] }));
    const jwks = jwksWith();
    await jwks.getKey('a');

    for (const kid of ['x', 'y', 'z']) {
      expect(await jwks.getKey(kid)).toBeUndefined();
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    now += 60 * 1000;
    await jwks.getKey('x');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('처음 받기에 실패하면 503', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(jwksWith().getKey('a')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('응답이 5xx이거나 keys가 없으면 503', async () => {
    for (const response of [
      jsonResponse({ message: 'error' }, 500),
      jsonResponse({ nope: [] }),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
      await expect(jwksWith().getKey('a')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('다시 받기에 실패해도 예전 키로 계속 검증한다', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ keys: [keyA.jwk] }));
    const jwks = jwksWith();
    await jwks.getKey('a');

    now += 60 * 60 * 1000;
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    expect(await jwks.getKey('a')).toContain('BEGIN PUBLIC KEY');
  });

  it('RSA가 아니거나 모양이 틀린 키는 건너뛰고 나머지는 쓴다', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        keys: [
          { kty: 'EC', kid: 'ec', crv: 'P-256', x: 'x', y: 'y' },
          { kty: 'RSA', kid: 'broken', n: '', e: '' },
          { kty: 'RSA' },
          'not-an-object',
          keyA.jwk,
        ],
      }),
    );
    const jwks = jwksWith();

    expect(await jwks.getKey('a')).toContain('BEGIN PUBLIC KEY');
    expect(await jwks.getKey('ec')).toBeUndefined();
    expect(await jwks.getKey('broken')).toBeUndefined();
  });
});
