import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

export const JUSO_SEARCH_URL =
  'https://business.juso.go.kr/addrlink/addrLinkApi.do';
export const JUSO_COORD_URL =
  'https://business.juso.go.kr/addrlink/addrCoordApi.do';

/** 행안부가 이 안에 답하지 않으면 503. 찾기 화면이 오래 멈춰 있지 않게 한다. */
const JUSO_TIMEOUT_MS = 5000;
/** 한 번에 받을 주소 수. 찾기 화면 한 화면 분량이다. */
const SEARCH_COUNT = 10;

/** 행안부 시스템 오류(-999)와 짧은 시간 다량 호출(E0007). 잠시 뒤 다시 하면 된다. */
const UNAVAILABLE_CODES = new Set(['-999', 'E0007']);
/** 승인키가 틀렸거나(E0001) 개발키 기간이 끝났다(E0014). 사용자가 아니라 서버 설정 문제다. */
const KEY_ERROR_CODES = new Set(['E0001', 'E0014']);

/** 좌표제공 API에 넘길 건물 키. 도로명주소 검색 결과에서 받는다. */
export interface AddressRef {
  /** 행정구역코드(10자리). */
  admCd: string;
  /** 도로명코드(12자리). */
  rnMgtSn: string;
  /** 지하 여부. 0 지상, 1 지하. */
  udrtYn: '0' | '1';
  /** 건물 본번. */
  buldMnnm: number;
  /** 건물 부번(없으면 0). */
  buldSlno: number;
}

/** 도로명주소 검색 결과 하나. */
export interface JusoAddress {
  /** 도로명주소(참고 항목 제외). 예: "경기도 안양시 동안구 관악대로 472". */
  roadAddress: string;
  /** 참고 항목. 예: "(관양동)". 없으면 null. */
  roadAddressExtra: string | null;
  jibunAddress: string;
  /** 건물명. 가게 이름과 다를 때가 많다. 없으면 null. */
  buildingName: string | null;
  zipCode: string;
  ref: AddressRef;
}

interface JusoBody {
  results?: {
    common?: { errorCode?: unknown; errorMessage?: unknown };
    juso?: unknown;
  };
}

type JusoItem = Record<string, unknown>;

/**
 * 행안부 도로명주소 검색 API와 좌표제공 API. 공공데이터(이용허락범위 제한 없음)라 결과를 장소에 저장해도 된다.
 * 승인키는 API마다 따로 받고 서버에만 둔다. e2e는 이 클래스를 가짜로 바꿔 끼운다(`test/setup/juso.ts`).
 */
@Injectable()
export class JusoClient {
  private readonly logger = new Logger(JusoClient.name);
  private readonly addressKey: string;
  private readonly coordKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.addressKey = config.get('JUSO_ADDRESS_KEY', { infer: true });
    this.coordKey = config.get('JUSO_COORD_KEY', { infer: true });
  }

  /** [keyword]로 찾은 주소. 검색어가 행안부 기준에 맞지 않으면(너무 짧음 등) 빈 목록이다. */
  async searchAddresses(keyword: string): Promise<JusoAddress[]> {
    const items = await this.call(JUSO_SEARCH_URL, {
      confmKey: this.addressKey,
      currentPage: '1',
      countPerPage: String(SEARCH_COUNT),
      keyword,
      resultType: 'json',
    });
    return items.map(toAddress).filter((item) => item !== null);
  }

  /** 건물 출입구 좌표(UTM-K, 미터). 없으면 null. */
  async findCoordinate(
    ref: AddressRef,
  ): Promise<{ x: number; y: number } | null> {
    const items = await this.call(JUSO_COORD_URL, {
      confmKey: this.coordKey,
      admCd: ref.admCd,
      rnMgtSn: ref.rnMgtSn,
      udrtYn: ref.udrtYn,
      buldMnnm: String(ref.buldMnnm),
      buldSlno: String(ref.buldSlno),
      resultType: 'json',
    });
    const item = items[0];
    if (!item) return null;
    const x = toNumber(item.entX);
    const y = toNumber(item.entY);
    return x === null || y === null ? null : { x, y };
  }

  /** API를 불러 결과 줄을 돌려준다. 입력 오류는 빈 목록, 행안부 장애는 503, 승인키 오류는 500. */
  private async call(
    url: string,
    params: Record<string, string>,
  ): Promise<JusoItem[]> {
    const name = url === JUSO_SEARCH_URL ? '도로명주소 검색' : '좌표제공';
    let response: Response;
    try {
      response = await fetch(`${url}?${new URLSearchParams(params)}`, {
        signal: AbortSignal.timeout(JUSO_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(`${name} API에 닿지 못함: ${String(error)}`);
      throw new ServiceUnavailableException();
    }

    let body: JusoBody | null = null;
    if (response.ok) {
      try {
        body = (await response.json()) as JusoBody;
      } catch {
        body = null;
      }
    }
    const code = body?.results?.common?.errorCode;
    if (typeof code !== 'string') {
      // 승인키는 주소에 들어 있어서 로그에 주소를 남기지 않는다.
      this.logger.warn(
        `${name} API 응답이 예상과 다름: HTTP ${response.status}`,
      );
      throw new ServiceUnavailableException();
    }
    if (code === '0') {
      const items = body?.results?.juso;
      return Array.isArray(items)
        ? items.filter(
            (item): item is JusoItem => typeof item === 'object' && !!item,
          )
        : [];
    }
    const message = text(body?.results?.common?.errorMessage) ?? '';
    if (UNAVAILABLE_CODES.has(code)) {
      this.logger.warn(`${name} API 일시 오류: ${code} ${message}`);
      throw new ServiceUnavailableException();
    }
    if (KEY_ERROR_CODES.has(code)) {
      this.logger.error(`${name} API 승인키 오류: ${code} ${message}`);
      throw new InternalServerErrorException();
    }
    // 검색어·요청 값이 행안부 기준에 맞지 않는다(예: 시도명만, 한 글자). 찾은 것이 없는 것으로 본다.
    return [];
  }
}

/** 검색 결과 줄. 좌표 조회에 필요한 값이 빠졌으면 null(고를 수 없는 줄이다). */
function toAddress(item: JusoItem): JusoAddress | null {
  const admCd = text(item.admCd);
  const rnMgtSn = text(item.rnMgtSn);
  const udrtYn = text(item.udrtYn);
  const buldMnnm = toNumber(item.buldMnnm);
  const buldSlno = toNumber(item.buldSlno) ?? 0;
  const roadAddress = text(item.roadAddrPart1);
  if (
    !admCd ||
    !rnMgtSn ||
    (udrtYn !== '0' && udrtYn !== '1') ||
    buldMnnm === null ||
    !roadAddress
  ) {
    return null;
  }
  return {
    roadAddress,
    roadAddressExtra: text(item.roadAddrPart2),
    jibunAddress: text(item.jibunAddr) ?? '',
    buildingName: text(item.bdNm),
    zipCode: text(item.zipNo) ?? '',
    ref: { admCd, rnMgtSn, udrtYn, buldMnnm, buldSlno },
  };
}

/** 앞뒤 공백을 뗀 글. 비었거나 글이 아니면 null. */
function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function toNumber(value: unknown): number | null {
  const raw = text(value);
  if (raw === null) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}
