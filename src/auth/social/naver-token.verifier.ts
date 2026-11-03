import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  normalizeNickname,
  SocialIdentity,
  SocialTokenVerifier,
} from './social-identity';

export const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';
/** 네이버가 이 안에 답하지 않으면 503. 로그인 화면이 오래 멈춰 있지 않게 한다. */
const NAVER_TIMEOUT_MS = 5000;

/** 네이버 접근 토큰이 틀렸거나 만료됐을 때의 resultcode. */
const NAVER_AUTH_FAILED = '024';
/** 헤더에 넣을 수 있는 글자(공백·제어 문자 제외). 아니면 fetch가 던져서 503이 된다. */
const TOKEN_PATTERN = /^[\x21-\x7e]+$/;

interface NaverProfileBody {
  resultcode?: unknown;
  response?: { id?: unknown; nickname?: unknown };
}

/**
 * 네이버 로그인. 앱이 네이버 SDK로 받은 access token으로 네이버 프로필 API를 불러 사용자를 확인한다.
 *
 * 앱의 네이버 SDK(flutter_naver_login)는 id_token을 주지 않아서, 서명 검증 대신 네이버에 직접 묻는다.
 * access token에는 aud가 없지만, 네이버 사용자 ID는 앱마다 달라서 다른 앱의 토큰으로는 우리 앱의 기존 계정에 닿지 못한다.
 * 서버에는 네이버 키가 필요 없다.
 */
@Injectable()
export class NaverTokenVerifier implements SocialTokenVerifier {
  private readonly logger = new Logger(NaverTokenVerifier.name);

  async verify(accessToken: string): Promise<SocialIdentity> {
    if (!TOKEN_PATTERN.test(accessToken)) throw new UnauthorizedException();

    let response: Response;
    try {
      response = await fetch(NAVER_PROFILE_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(NAVER_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`네이버 프로필 API에 닿지 못함: ${String(error)}`);
      throw new ServiceUnavailableException();
    }
    if (response.status === 401) throw new UnauthorizedException();

    let body: NaverProfileBody;
    try {
      body = (await response.json()) as NaverProfileBody;
    } catch {
      body = {};
    }
    if (body.resultcode === NAVER_AUTH_FAILED)
      throw new UnauthorizedException();

    const id = body.response?.id;
    if (
      !response.ok ||
      body.resultcode !== '00' ||
      typeof id !== 'string' ||
      id === ''
    ) {
      // 토큰 문제가 아니라 네이버 장애나 앱 설정 문제(API 권한 등)다. 로그로 남기고 503.
      this.logger.warn(
        `네이버 프로필 API 응답이 예상과 다름: HTTP ${response.status}, resultcode ${String(body.resultcode)}`,
      );
      throw new ServiceUnavailableException();
    }
    return {
      providerUserId: id,
      nickname: normalizeNickname(body.response?.nickname),
    };
  }
}
