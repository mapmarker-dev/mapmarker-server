import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApiIdProperty } from '../../common/app-id';
import type { Segment } from '../../generated/prisma/client';
import { SegmentType } from '../../generated/prisma/enums';
import {
  TRANSPORT_MODES,
  type TransportLeg,
  type TransportMode,
} from '../transport-leg';

export class TransportLegResponse implements TransportLeg {
  @ApiProperty({ enum: TRANSPORT_MODES, enumName: 'TransportMode' })
  mode: TransportMode;

  @ApiPropertyOptional({ description: '지나는 정류장 수. 지하철·버스만' })
  stopCount?: number;

  @ApiPropertyOptional({ description: '걸리는 시간(분)' })
  durationMinutes?: number;
}

/** 구간. 필드 이름과 모양은 앱 모델(Segment)과 같다. */
export class SegmentResponse {
  @ApiIdProperty()
  id: string;

  @ApiIdProperty()
  tripId: string;

  @ApiIdProperty()
  fromStopId: string;

  @ApiIdProperty()
  toStopId: string;

  @ApiProperty({
    type: [TransportLegResponse],
    description: '갈아타는 차례대로. 비어 있으면 미정',
  })
  legs: TransportLegResponse[];

  @ApiProperty({ description: '곡률 k. 0이면 직선, -1~1' })
  curvature: number;

  @ApiProperty({ enum: SegmentType, enumName: 'SegmentType' })
  type: SegmentType;
}

export function toSegmentResponse(segment: Segment): SegmentResponse {
  return {
    id: segment.id,
    tripId: segment.tripId,
    fromStopId: segment.fromStopId,
    toStopId: segment.toStopId,
    // 쓸 때 DTO가 모양을 검사하므로 읽을 때는 그대로 믿는다.
    legs: segment.legs as unknown as TransportLeg[],
    curvature: segment.curvature,
    type: segment.type,
  };
}
