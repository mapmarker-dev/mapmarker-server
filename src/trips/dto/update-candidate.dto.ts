import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CanOmit } from '../../common/can-omit.decorator';
import { NOT_BLANK } from '../../common/text';
import { MapProvider, StopKind } from '../../generated/prisma/enums';
import {
  PLACE_ID_MAX_LENGTH,
  STOP_NAME_MAX_LENGTH,
  STOP_TEXT_MAX_LENGTH,
} from './create-stop.dto';

/** 후보 고치기. 보낸 필드만 바꾼다. 장소 서비스 ID는 null로 지우고, 나머지는 null을 받지 않는다. */
export class UpdateCandidateDto {
  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @CanOmit()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @CanOmit()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

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
    enum: MapProvider,
    enumName: 'MapProvider',
    nullable: true,
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
