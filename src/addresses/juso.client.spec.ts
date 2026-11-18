import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jsonResponse } from '../../test/setup/signing-keys';
import type { Env } from '../config/env';
import {
  AddressRef,
  JUSO_COORD_URL,
  JUSO_SEARCH_URL,
  JusoClient,
} from './juso.client';

describe('JusoClient', () => {
  const config = {
    get: (key: keyof Env) =>
      ({
        JUSO_ADDRESS_KEY: 'address-key',
        JUSO_COORD_KEY: 'coord-key',
      })[key as string],
  } as unknown as ConfigService<Env, true>;
  const client = new JusoClient(config);
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  const ref: AddressRef = {
    admCd: '4117310400',
    rnMgtSn: '411734349005',
    udrtYn: '0',
    buldMnnm: 472,
    buldSlno: 0,
  };

  /** 행안부 API 응답 모양. 전체 개수(totalCount)는 받은 줄 수다. */
  function juso(
    errorCode: string,
    items: object[] | null = [],
    totalCount: unknown = String(items?.length ?? 0),
  ) {
    return jsonResponse({
      results: {
        common: { errorCode, errorMessage: '메시지', totalCount },
        juso: items,
      },
    });
  }

  const searchItem = {
    roadAddr: '경기도 안양시 동안구 관악대로 472 (관양동)',
    roadAddrPart1: '경기도 안양시 동안구 관악대로 472',
    roadAddrPart2: ' (관양동)',
    jibunAddr: '경기도 안양시 동안구 관양동 1588',
    zipNo: '14054',
    admCd: '4117310400',
    rnMgtSn: '411734349005',
    udrtYn: '0',
    buldMnnm: '472',
    buldSlno: 0,
    bdNm: '',
  };

  /** fetch가 받은 주소. */
  function requestedUrl(): URL {
    return new URL(fetchMock.mock.calls[0][0] as string);
  }

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('searchAddresses', () => {
    it('검색 결과를 주소 목록으로 바꾼다(빈 건물명·참고 항목은 null, 번호는 숫자)', async () => {
      fetchMock.mockResolvedValue(
        juso('0', [
          searchItem,
          { ...searchItem, bdNm: '인덕원빌딩', roadAddrPart2: '' },
        ]),
      );

      await expect(client.searchAddresses('관악대로 472')).resolves.toEqual({
        addresses: [
          {
            roadAddress: '경기도 안양시 동안구 관악대로 472',
            roadAddressExtra: '(관양동)',
            jibunAddress: '경기도 안양시 동안구 관양동 1588',
            buildingName: null,
            zipCode: '14054',
            ref,
          },
          {
            roadAddress: '경기도 안양시 동안구 관악대로 472',
            roadAddressExtra: null,
            jibunAddress: '경기도 안양시 동안구 관양동 1588',
            buildingName: '인덕원빌딩',
            zipCode: '14054',
            ref,
          },
        ],
        totalCount: 2,
      });
    });

    it('행안부의 전체 개수를 돌려준다(받은 10건보다 많을 수 있다)', async () => {
      fetchMock.mockResolvedValue(
        juso('0', Array<object>(10).fill(searchItem), '1234'),
      );

      const result = await client.searchAddresses('강남역');

      expect(result.addresses).toHaveLength(10);
      expect(result.totalCount).toBe(1234);
    });

    it('전체 개수가 없거나 숫자가 아니면 받은 줄 수로 본다(더 없음)', async () => {
      fetchMock.mockResolvedValueOnce(juso('0', [searchItem], undefined));
      await expect(client.searchAddresses('관악대로 472')).resolves.toEqual(
        expect.objectContaining({ totalCount: 1 }),
      );

      fetchMock.mockResolvedValueOnce(juso('0', [searchItem], '많음'));
      await expect(client.searchAddresses('관악대로 472')).resolves.toEqual(
        expect.objectContaining({ totalCount: 1 }),
      );
    });

    it('승인키·검색어·JSON·10건을 담아 부른다', async () => {
      fetchMock.mockResolvedValue(juso('0'));

      await client.searchAddresses('관악대로 472');

      const url = requestedUrl();
      expect(`${url.origin}${url.pathname}`).toBe(JUSO_SEARCH_URL);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        confmKey: 'address-key',
        currentPage: '1',
        countPerPage: '10',
        keyword: '관악대로 472',
        resultType: 'json',
      });
    });

    it('결과가 없으면(juso가 null이어도) 빈 목록', async () => {
      fetchMock.mockResolvedValue(juso('0', null));

      await expect(client.searchAddresses('없는 주소')).resolves.toEqual({
        addresses: [],
        totalCount: 0,
      });
    });

    it('좌표 조회에 필요한 값이 빠진 줄은 빼고 전체 개수에서도 뺀다', async () => {
      const broken = { ...searchItem, admCd: undefined };
      // 더 없을 때는 전체 개수가 목록 길이와 같아야 앱이 "결과가 많다"고 하지 않는다.
      fetchMock.mockResolvedValueOnce(juso('0', [searchItem, broken]));
      await expect(client.searchAddresses('관악대로 472')).resolves.toEqual({
        addresses: [expect.anything()],
        totalCount: 1,
      });

      fetchMock.mockResolvedValueOnce(juso('0', [searchItem, broken], '30'));
      await expect(client.searchAddresses('관악대로 472')).resolves.toEqual(
        expect.objectContaining({ totalCount: 29 }),
      );
    });

    it.each(['E0005', 'E0006', 'E0008', 'E0009', 'E0012', 'E0015'])(
      '검색어 오류(%s)는 빈 목록',
      async (code) => {
        fetchMock.mockResolvedValue(juso(code, null));

        await expect(client.searchAddresses('서울')).resolves.toEqual({
          addresses: [],
          totalCount: 0,
        });
      },
    );

    it.each(['-999', 'E0007'])(
      '행안부 시스템 오류·호출 과다(%s)는 503',
      async (code) => {
        fetchMock.mockResolvedValue(juso(code, null));

        await expect(
          client.searchAddresses('서울 종로구'),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);
      },
    );

    it.each(['E0001', 'E0014'])(
      '승인키 오류(%s)는 서버 설정 문제라 500',
      async (code) => {
        fetchMock.mockResolvedValue(juso(code, null));

        await expect(
          client.searchAddresses('서울 종로구'),
        ).rejects.toBeInstanceOf(InternalServerErrorException);
      },
    );

    it('닿지 못하거나 시간이 지나면 503', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        client.searchAddresses('서울 종로구'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    });

    it('HTTP 오류나 알아볼 수 없는 응답은 503', async () => {
      fetchMock.mockResolvedValueOnce(new Response('down', { status: 500 }));
      await expect(
        client.searchAddresses('서울 종로구'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }));
      await expect(
        client.searchAddresses('서울 종로구'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('findCoordinate', () => {
    it('좌표 승인키와 주소 키로 불러 entX·entY를 숫자로 돌려준다', async () => {
      fetchMock.mockResolvedValue(
        juso('0', [{ ...ref, entX: '953900.123', entY: '1952000.5' }]),
      );

      await expect(client.findCoordinate(ref)).resolves.toEqual({
        x: 953900.123,
        y: 1952000.5,
      });
      const url = requestedUrl();
      expect(`${url.origin}${url.pathname}`).toBe(JUSO_COORD_URL);
      expect(Object.fromEntries(url.searchParams)).toEqual({
        confmKey: 'coord-key',
        admCd: '4117310400',
        rnMgtSn: '411734349005',
        udrtYn: '0',
        buldMnnm: '472',
        buldSlno: '0',
        resultType: 'json',
      });
    });

    it('결과가 없거나 좌표가 숫자가 아니면 null', async () => {
      fetchMock.mockResolvedValueOnce(juso('0', []));
      await expect(client.findCoordinate(ref)).resolves.toBeNull();

      fetchMock.mockResolvedValueOnce(juso('0', [{ entX: '', entY: '' }]));
      await expect(client.findCoordinate(ref)).resolves.toBeNull();
    });

    it('오류 코드는 검색과 같게 다룬다', async () => {
      fetchMock.mockResolvedValueOnce(juso('E0002', null));
      await expect(client.findCoordinate(ref)).resolves.toBeNull();

      fetchMock.mockResolvedValueOnce(juso('E0007', null));
      await expect(client.findCoordinate(ref)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      fetchMock.mockResolvedValueOnce(juso('E0001', null));
      await expect(client.findCoordinate(ref)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});
