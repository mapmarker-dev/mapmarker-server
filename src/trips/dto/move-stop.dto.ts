import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_NIGHTS } from './create-trip.dto';

/** 장소 옮기기. 그 일차의 다른 장소들 사이 order 자리로 간다. 장소 수보다 크면 맨 뒤다. */
export class MoveStopDto {
  @ApiProperty({ minimum: 1, description: '1일차부터. 여행 일수(박 + 1)까지' })
  @IsInt()
  @Min(1)
  @Max(MAX_NIGHTS + 1)
  day: number;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  order: number;
}
