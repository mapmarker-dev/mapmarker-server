import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { NOT_BLANK } from '../../common/text';

/** 붙여 넣거나 친 글의 최대 길이. 주소 한 줄에 상세 주소가 붙어도 넉넉하다. */
export const ADDRESS_QUERY_MAX_LENGTH = 200;

/** 주소 검색. 지도 앱에서 복사한 주소를 그대로 보내면 서버가 검색어와 상세 주소로 나눈다. */
export class SearchAddressesQuery {
  @ApiProperty({
    maxLength: ADDRESS_QUERY_MAX_LENGTH,
    example: '경기 안양시 동안구 관악대로 472 1,2층',
    description: '주소나 건물명',
  })
  @IsString()
  @Matches(NOT_BLANK, { message: 'query가 비어 있습니다' })
  @MaxLength(ADDRESS_QUERY_MAX_LENGTH)
  query: string;
}
