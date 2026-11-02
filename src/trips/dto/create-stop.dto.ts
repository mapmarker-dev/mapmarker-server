import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsAppId } from '../../common/app-id';
import { CanOmit } from '../../common/can-omit.decorator';
import { IsLocalTime } from '../../common/local-time';
import { NOT_BLANK } from '../../common/text';
import { MapProvider, StopKind } from '../../generated/prisma/enums';
import { MAX_NIGHTS } from './create-trip.dto';

/** 글자 수 상한. 앱의 장소 입력 제한(stop_draft.dart)과 같다. */
export const STOP_NAME_MAX_LENGTH = 50;
export const STOP_TEXT_MAX_LENGTH = 1000;
export const PLACE_ID_MAX_LENGTH = 200;

export const TIME_ZONE_MESSAGE =
  'timeZone은 IANA 시간대 이름이어야 합니다(예: Asia/Seoul)';

/**
 * 장소 넣기. ID는 앱이 만든 UUID v7이다. 같은 곳을 여러 번 넣을 때(연박한 숙소 등)는 ID를 새로 만든다.
 * 일차는 1부터 여행 일수(박 + 1)까지이고 서비스가 여행을 보고 확인한다. 순서가 그 일차의 장소 수보다 크면 맨 뒤에 넣는다.
 * 방문 체크(visited·visitedAt)는 1-4단계에서 받는다.
 */
export class CreateStopDto {
  @IsAppId()
  id: string;

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

  @ApiProperty({ minimum: -90, maximum: 90, example: 35.1587 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ minimum: -180, maximum: 180, example: 129.1604 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: '해운대', maxLength: STOP_NAME_MAX_LENGTH })
  @IsString()
  @Matches(NOT_BLANK, { message: 'name이 비어 있습니다' })
  @MaxLength(STOP_NAME_MAX_LENGTH)
  name: string;

  @ApiPropertyOptional({
    enum: StopKind,
    enumName: 'StopKind',
    default: 'other',
  })
  @CanOmit()
  @IsEnum(StopKind)
  kind?: StopKind;

  @ApiPropertyOptional({ maxLength: STOP_TEXT_MAX_LENGTH, default: '' })
  @CanOmit()
  @IsString()
  @MaxLength(STOP_TEXT_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ maxLength: STOP_TEXT_MAX_LENGTH, default: '' })
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

  @ApiPropertyOptional({
    enum: MapProvider,
    enumName: 'MapProvider',
    nullable: true,
    description: 'placeId를 준 서비스. placeId와 함께 보낸다',
  })
  @IsOptional()
  @IsEnum(MapProvider)
  placeProvider?: MapProvider | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: PLACE_ID_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @Matches(NOT_BLANK, { message: 'placeId가 비어 있습니다' })
  @MaxLength(PLACE_ID_MAX_LENGTH)
  placeId?: string | null;
}
