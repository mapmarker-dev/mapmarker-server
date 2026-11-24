import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { APP_ID_EXAMPLE } from '../../common/app-id';
import { MAX_NIGHTS } from './create-trip.dto';

/** 한 일차에 보낼 수 있는 장소 수. 실제 하루 장소보다 넉넉하다. */
export const DAY_ORDER_MAX_STOPS = 200;

/**
 * 그날 순서를 통째로 바꾸기. stopIds는 그 일차의 모든 장소를 새 순서로 늘어놓은 것이다.
 * 앱이 순서 바꾸기를 [완료]할 때 한 번에 보낸다.
 */
export class OrderDayDto {
  @ApiProperty({ minimum: 1, description: '1일차부터. 여행 일수(박 + 1)까지' })
  @IsInt()
  @Min(1)
  @Max(MAX_NIGHTS + 1)
  day: number;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    example: [APP_ID_EXAMPLE],
    description: '그 일차의 장소 ID 전부(빠짐, 덤, 겹침 없이)를 새 순서로',
  })
  @IsArray()
  @ArrayMaxSize(DAY_ORDER_MAX_STOPS)
  @ArrayUnique()
  @IsUUID('7', { each: true })
  stopIds: string[];
}
