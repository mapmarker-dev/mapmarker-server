import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateBy,
  ValidateNested,
} from 'class-validator';
import { CanOmit } from '../../common/can-omit.decorator';
import { SegmentType } from '../../generated/prisma/enums';
import {
  MAX_DURATION_MINUTES,
  MAX_LEGS,
  MAX_STOP_COUNT,
  STOP_COUNTING_MODES,
  TRANSPORT_MODES,
  type TransportLeg,
  type TransportMode,
} from '../transport-leg';

/** 정류장 수는 정류장을 세는 수단(지하철·버스)에만 적는다. */
const OnlyForStopCountingModes = () =>
  ValidateBy({
    name: 'onlyForStopCountingModes',
    validator: {
      validate: (_value, args) => {
        const leg = args?.object as TransportLegDto | undefined;
        return leg !== undefined && STOP_COUNTING_MODES.includes(leg.mode);
      },
      defaultMessage: () => 'stopCount는 지하철·버스(subway, bus)에만 적습니다',
    },
  });

/** 이동 한 토막. 앱의 TransportLeg와 같고, 걸리는 시간은 분 단위 정수다. */
export class TransportLegDto implements TransportLeg {
  @ApiProperty({ enum: TRANSPORT_MODES, enumName: 'TransportMode' })
  @IsIn(TRANSPORT_MODES)
  mode: TransportMode;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_STOP_COUNT,
    description: '지나는 정류장 수. 지하철·버스만',
  })
  @CanOmit()
  @IsInt()
  @Min(1)
  @Max(MAX_STOP_COUNT)
  @OnlyForStopCountingModes()
  stopCount?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_DURATION_MINUTES,
    description: '걸리는 시간(분). 없으면 빼고 보낸다',
  })
  @CanOmit()
  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_MINUTES)
  durationMinutes?: number;
}

/**
 * 구간 고치기. 보낸 필드만 바꾸고 null은 받지 않는다(이동 수단을 비우려면 legs: [], 직선은 curvature: 0).
 * 어느 장소를 잇는지는 서버가 동선으로 정해서 받지 않는다. 구간 ID는 그대로다.
 */
export class UpdateSegmentDto {
  @ApiPropertyOptional({
    type: [TransportLegDto],
    maxItems: MAX_LEGS,
    description: '갈아타는 차례대로. 비어 있으면 미정',
  })
  @CanOmit()
  @IsArray()
  @ArrayMaxSize(MAX_LEGS)
  @ValidateNested({ each: true })
  @Type(() => TransportLegDto)
  legs?: TransportLegDto[];

  @ApiPropertyOptional({
    minimum: -1,
    maximum: 1,
    description: '곡률 k. 0이면 직선, 부호가 휘는 방향',
  })
  @CanOmit()
  @IsNumber()
  @Min(-1)
  @Max(1)
  curvature?: number;

  @ApiPropertyOptional({ enum: SegmentType, enumName: 'SegmentType' })
  @CanOmit()
  @IsEnum(SegmentType)
  type?: SegmentType;
}
