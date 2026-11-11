import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CanOmit } from '../../common/can-omit.decorator';
import { IsLocalTime } from '../../common/local-time';
import { NOT_BLANK } from '../../common/text';
import { StopKind } from '../../generated/prisma/enums';
import {
  STOP_NAME_MAX_LENGTH,
  STOP_TEXT_MAX_LENGTH,
  TIME_ZONE_MESSAGE,
} from './create-stop.dto';
import { MAX_NIGHTS } from './create-trip.dto';

/**
 * 후보를 동선에 넣기. 일차와 그 일차 안 자리(order)는 장소 넣기와 같다.
 * 나머지는 넣으면서 고칠 값이다. 보내지 않은 필드는 후보의 값(예정 시각은 없음, 시간대는 Asia/Seoul)이다.
 * 좌표와 장소 서비스 ID는 후보의 것을 그대로 쓴다.
 */
export class PromoteCandidateDto {
  @ApiProperty({ minimum: 1, description: '1일차부터. 여행 일수(박 + 1)까지' })
  @IsInt()
  @Min(1)
  @Max(MAX_NIGHTS + 1)
  day: number;

  @ApiProperty({
    minimum: 0,
    description: '그 일차에서 넣을 자리. 장소 수보다 크면 맨 뒤',
  })
  @IsInt()
  @Min(0)
  order: number;

  @ApiPropertyOptional({ maxLength: STOP_NAME_MAX_LENGTH })
  @CanOmit()
  @IsString()
  @Matches(NOT_BLANK, { message: 'name이 비어 있습니다' })
  @MaxLength(STOP_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({ enum: StopKind, enumName: 'StopKind' })
  @CanOmit()
  @IsEnum(StopKind)
  kind?: StopKind;

  @ApiPropertyOptional({ maxLength: STOP_TEXT_MAX_LENGTH })
  @CanOmit()
  @IsString()
  @MaxLength(STOP_TEXT_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ maxLength: STOP_TEXT_MAX_LENGTH })
  @CanOmit()
  @IsString()
  @MaxLength(STOP_TEXT_MAX_LENGTH)
  memo?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '09:30',
    description: 'timeZone 기준 현지 시:분',
  })
  @IsOptional()
  @IsLocalTime()
  plannedTime?: string | null;

  @ApiPropertyOptional({ example: 'Asia/Seoul', default: 'Asia/Seoul' })
  @CanOmit()
  @IsString()
  @IsTimeZone({ message: TIME_ZONE_MESSAGE })
  timeZone?: string;
}
