import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsAppId } from '../../common/app-id';
import { MapProvider, Season, TripPhase } from '../../generated/prisma/enums';
import { TripDatesDto } from './trip-dates.dto';

/** 글자 수와 박 수 상한. 앱 연동 때 앱의 입력 제한도 이 값에 맞춘다. */
export const TITLE_MAX_LENGTH = 100;
export const REGION_MAX_LENGTH = 50;
export const MAX_NIGHTS = 365;

/** 빈칸만 있는 글자는 받지 않는다. */
export const NOT_BLANK = /\S/;

/**
 * 여행 만들기. ID는 앱이 만든 UUID v7이다.
 * origin·copiedFromTripId·shareId·createdAt·updatedAt은 서버가 정해서 받지 않는다(보내면 400).
 */
export class CreateTripDto {
  @IsAppId()
  id: string;

  @ApiProperty({
    example: '부산 2박 3일 가을 여행',
    maxLength: TITLE_MAX_LENGTH,
  })
  @IsString()
  @Matches(NOT_BLANK, { message: 'title이 비어 있습니다' })
  @MaxLength(TITLE_MAX_LENGTH)
  title: string;

  @ApiProperty({ example: '부산', maxLength: REGION_MAX_LENGTH })
  @IsString()
  @Matches(NOT_BLANK, { message: 'region이 비어 있습니다' })
  @MaxLength(REGION_MAX_LENGTH)
  region: string;

  @ApiProperty({
    description:
      '몇 박인지. 당일치기는 0. 기간이 있으면 종료일 − 시작일과 같아야 한다',
    minimum: 0,
    maximum: MAX_NIGHTS,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_NIGHTS)
  nights: number;

  @ApiProperty({ enum: Season, enumName: 'Season' })
  @IsEnum(Season)
  season: Season;

  @ApiPropertyOptional({
    type: TripDatesDto,
    nullable: true,
    description: '없으면 날짜 미정',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TripDatesDto)
  dates?: TripDatesDto | null;

  @ApiPropertyOptional({
    enum: TripPhase,
    enumName: 'TripPhase',
    nullable: true,
    description: '직접 바꾼 상태. 없으면 앱이 기간과 기기 날짜로 계산한다',
  })
  @IsOptional()
  @IsEnum(TripPhase)
  phaseOverride?: TripPhase | null;

  @ApiPropertyOptional({
    enum: MapProvider,
    enumName: 'MapProvider',
    nullable: true,
    description: '직접 고른 지도. 없으면 장소 위치로 자동 선택(2단계)',
  })
  @IsOptional()
  @IsEnum(MapProvider)
  mapProvider?: MapProvider | null;
}
