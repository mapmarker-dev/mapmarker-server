import { ApiProperty } from '@nestjs/swagger';

/** 건물 출입구 좌표(WGS84). */
export class CoordinateResponse {
  @ApiProperty({ example: 37.3999 })
  latitude: number;

  @ApiProperty({ example: 126.9766 })
  longitude: number;
}
