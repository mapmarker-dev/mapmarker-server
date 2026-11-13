import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Matches, Min } from 'class-validator';
import type { AddressRef } from '../juso.client';

/** 좌표 조회. 주소 검색 결과의 `ref`를 그대로 보낸다. */
export class CoordinateQuery implements AddressRef {
  @ApiProperty({ example: '4117310400', description: '행정구역코드(10자리)' })
  @Matches(/^\d{10}$/, { message: 'admCd는 10자리 숫자입니다' })
  admCd: string;

  @ApiProperty({ example: '411734349005', description: '도로명코드(12자리)' })
  @Matches(/^\d{12}$/, { message: 'rnMgtSn은 12자리 숫자입니다' })
  rnMgtSn: string;

  @ApiProperty({ enum: ['0', '1'], description: '지하 여부(0 지상, 1 지하)' })
  @IsIn(['0', '1'])
  udrtYn: '0' | '1';

  @ApiProperty({ minimum: 0, example: 472, description: '건물 본번' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  buldMnnm: number;

  @ApiProperty({ minimum: 0, example: 0, description: '건물 부번(없으면 0)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  buldSlno: number;
}
