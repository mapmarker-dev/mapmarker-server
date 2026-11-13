import { ServiceUnavailableException } from '@nestjs/common';
import { TestingModuleBuilder } from '@nestjs/testing';
import {
  AddressRef,
  JusoAddress,
  JusoClient,
} from '../../src/addresses/juso.client';

/** 실제 행안부 API 대신 쓰는 가짜 주소 클라이언트. 테스트가 결과를 정하고, 받은 요청을 기억한다. */
export class FakeJusoClient implements Pick<
  JusoClient,
  'searchAddresses' | 'findCoordinate'
> {
  /** 검색 결과. */
  addresses: JusoAddress[] = [];
  /** 좌표(UTM-K). null이면 없음. */
  coordinate: { x: number; y: number } | null = null;
  /** true면 행안부에 닿지 못한다(503). */
  down = false;

  readonly keywords: string[] = [];
  readonly refs: AddressRef[] = [];

  searchAddresses(keyword: string): Promise<JusoAddress[]> {
    this.keywords.push(keyword);
    if (this.down) return Promise.reject(new ServiceUnavailableException());
    return Promise.resolve(this.addresses);
  }

  findCoordinate(ref: AddressRef): Promise<{ x: number; y: number } | null> {
    this.refs.push(ref);
    if (this.down) return Promise.reject(new ServiceUnavailableException());
    return Promise.resolve(this.coordinate);
  }
}

/** 행안부 주소 클라이언트를 [fake]로 바꿔 끼운다. 주소 API를 부르는 e2e는 모두 이것을 거친다. */
export function withFakeJuso(
  builder: TestingModuleBuilder,
  fake = new FakeJusoClient(),
): TestingModuleBuilder {
  return builder.overrideProvider(JusoClient).useValue(fake);
}
