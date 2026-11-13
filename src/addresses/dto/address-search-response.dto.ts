import { ApiProperty } from '@nestjs/swagger';
import type { AddressRef, JusoAddress } from '../juso.client';

/** 좌표 조회(GET /v1/addresses/coordinates)에 그대로 넘길 건물 키. */
export class AddressRefResponse implements AddressRef {
  @ApiProperty({ example: '4117310400' })
  admCd: string;

  @ApiProperty({ example: '411734349005' })
  rnMgtSn: string;

  @ApiProperty({ enum: ['0', '1'] })
  udrtYn: '0' | '1';

  @ApiProperty({ example: 472 })
  buldMnnm: number;

  @ApiProperty({ example: 0 })
  buldSlno: number;
}

/** 찾은 주소 하나. */
export class AddressResponse implements JusoAddress {
  @ApiProperty({
    example: '경기도 안양시 동안구 관악대로 472',
    description: '도로명주소(참고 항목 제외)',
  })
  roadAddress: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '(관양동)',
    description: '참고 항목(법정동, 공동주택명)',
  })
  roadAddressExtra: string | null;

  @ApiProperty({ example: '경기도 안양시 동안구 관양동 1588' })
  jibunAddress: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '건물명. 가게 이름과 다를 때가 많다',
  })
  buildingName: string | null;

  @ApiProperty({ example: '14054' })
  zipCode: string;

  @ApiProperty({ type: AddressRefResponse })
  ref: AddressRefResponse;
}

/** 주소 검색 결과. */
export class AddressSearchResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '1,2층',
    description: '검색어에서 떼어 낸 상세 주소. 앱이 주소 칸에 이어 붙인다',
  })
  detail: string | null;

  @ApiProperty({
    type: [AddressResponse],
    description: '최대 10건. 없으면 빈 배열',
  })
  addresses: AddressResponse[];
}
