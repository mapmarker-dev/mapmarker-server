import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { CanOmit } from '../../common/can-omit.decorator';
import { NOT_BLANK } from '../../common/text';
import { MapProvider, Season, TripPhase } from '../../generated/prisma/enums';
import {
  MAX_NIGHTS,
  REGION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from './create-trip.dto';
import { TripDatesDto } from './trip-dates.dto';

/**
 * 여행 고치기. 보낸 필드만 바꾼다.
 * 제목·지역·박 수·계절은 null을 받지 않고(CanOmit), 기간·상태·지도는 null로 지운다(IsOptional).
 * 기간과 박 수는 바꾼 뒤의 값끼리 맞아야 한다.
 */
export class UpdateTripDto {
  @ApiPropertyOptional({ maxLength: TITLE_MAX_LENGTH })
  @CanOmit()
  @IsString()
  @Matches(NOT_BLANK, { message: 'title이 비어 있습니다' })
  @MaxLength(TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ maxLength: REGION_MAX_LENGTH })
  @CanOmit()
  @IsString()
  @Matches(NOT_BLANK, { message: 'region이 비어 있습니다' })
  @MaxLength(REGION_MAX_LENGTH)
  region?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: MAX_NIGHTS })
  @CanOmit()
  @IsInt()
  @Min(0)
  @Max(MAX_NIGHTS)
  nights?: number;

  @ApiPropertyOptional({ enum: Season, enumName: 'Season' })
  @CanOmit()
  @IsEnum(Season)
  season?: Season;

  @ApiPropertyOptional({
    type: TripDatesDto,
    nullable: true,
    description: 'null이면 날짜 미정으로 바꾼다',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => TripDatesDto)
  dates?: TripDatesDto | null;

  @ApiPropertyOptional({
    enum: TripPhase,
    enumName: 'TripPhase',
    nullable: true,
    description: 'null이면 자동(기간으로 판단)으로 되돌린다',
  })
  @IsOptional()
  @IsEnum(TripPhase)
  phaseOverride?: TripPhase | null;

  @ApiPropertyOptional({
    enum: MapProvider,
    enumName: 'MapProvider',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(MapProvider)
  mapProvider?: MapProvider | null;
}
