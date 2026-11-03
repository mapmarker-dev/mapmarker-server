import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { jsonResponse } from '../../../test/setup/signing-keys';
import { NAVER_PROFILE_URL, NaverTokenVerifier } from './naver-token.verifier';

describe('NaverTokenVerifier', () => {
  const verifier = new NaverTokenVerifier();
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  /** 네이버 프로필 API의 성공 응답. */
  function profile(response: Record<string, unknown>) {
    return jsonResponse({ resultcode: '00', message: 'success', response });
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('access token으로 프로필 API를 불러 id와 별명을 돌려준다', async () => {
    fetchMock.mockResolvedValue(
      profile({ id: 'naver-id-1', nickname: '길잡이' }),
    );

    await expect(verifier.verify('AAAA+token/value=')).resolves.toEqual({
      providerUserId: 'naver-id-1',
      nickname: '길잡이',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      NAVER_PROFILE_URL,
      expect.objectContaining({
        headers: { Authorization: 'Bearer AAAA+token/value=' },
      }),
    );
  });

  it('별명 제공에 동의하지 않았으면 null', async () => {
    fetchMock.mockResolvedValue(profile({ id: 'naver-id-1' }));

    await expect(verifier.verify('token')).resolves.toEqual({
      providerUserId: 'naver-id-1',
      nickname: null,
    });
  });

  it('네이버가 토큰을 거절하면(401, resultcode 024) 401', async () => {
    for (const response of [
      jsonResponse(
        { resultcode: '024', message: 'Authentication failed' },
        401,
      ),
      jsonResponse({ resultcode: '024', message: 'Authentication failed' }),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
      await expect(verifier.verify('expired')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('헤더에 넣을 수 없는 토큰은 네이버를 부르지 않고 401', async () => {
    for (const token of ['', 'a b', 'abc\r\nX-Evil: 1', '토큰']) {
      await expect(verifier.verify(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('네이버에 닿지 못하거나 시간이 지나면 503', async () => {
    for (const error of [
      new TypeError('fetch failed'),
      new DOMException('The operation was aborted', 'TimeoutError'),
    ]) {
      fetchMock.mockRejectedValueOnce(error);
      await expect(verifier.verify('token')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });

  it('네이버 장애·설정 문제(5xx, 403, 이상한 응답)는 503', async () => {
    for (const response of [
      jsonResponse({ resultcode: '500', message: 'error' }, 500),
      jsonResponse({ resultcode: '403', message: 'forbidden' }, 403),
      new Response('<html>', { status: 200 }),
      jsonResponse({ resultcode: '00', response: {} }),
      jsonResponse({ resultcode: '00', response: { id: '' } }),
    ]) {
      fetchMock.mockResolvedValueOnce(response);
      await expect(verifier.verify('token')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    }
  });
});
