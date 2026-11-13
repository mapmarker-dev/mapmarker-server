import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { IsAppId } from '../../common/app-id';
import { CanOmit } from '../../common/can-omit.decorator';
import { NOT_BLANK } from '../../common/text';
import { MapProvider, StopKind } from '../../generated/prisma/enums';
import {
  PLACE_ID_MAX_LENGTH,
  STOP_NAME_MAX_LENGTH,
  STOP_TEXT_MAX_LENGTH,
} from './create-stop.dto';

/**
 * 후보 넣기. ID는 앱이 만든 UUID v7이다. 같은 ID의 장소나 후보가 이미 있으면 409.
 * 글자 수 상한은 장소와 같다(동선에 넣으면 장소가 된다).
 */
export class CreateCandidateDto {
  @IsAppId()
  id: string;

  @ApiProperty({ minimum: -90, maximum: 90, example: 33.5065 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ minimum: -180, maximum: 180, example: 126.9535 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: '우도', maxLength: STOP_NAME_MAX_LENGTH })
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
