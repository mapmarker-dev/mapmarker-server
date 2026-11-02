import { ApiProperty } from '@nestjs/swagger';
import { ApiIdProperty } from '../../common/app-id';
import { formatLocalTime } from '../../common/local-time';
import type { Stop } from '../../generated/prisma/client';
import { MapProvider, StopKind } from '../../generated/prisma/enums';

/** 장소. 필드 이름과 모양은 앱 모델(Stop)과 같다. */
export class StopResponse {
  @ApiIdProperty()
  id: string;

  @ApiIdProperty()
  tripId: string;

  @ApiProperty({ description: '1일차부터' })
  day: number;

  @ApiProperty({ description: '일차 안의 순서. 0부터 빈칸 없이' })
  order: number;

  @ApiProperty()
  latitude: number;

  @ApiProperty()
  longitude: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: StopKind, enumName: 'StopKind' })
  kind: StopKind;

  @ApiProperty({ description: '사용자가 쓴 설명. 공유하면 보인다' })
  description: string;

  @ApiProperty({ description: '작성자의 개인 기록. 공유하면 숨긴다' })
  memo: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '09:30',
    description: 'timeZone 기준 현지 시:분',
  })
  plannedTime: string | null;

  @ApiProperty()
  visited: boolean;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  visitedAt: string | null;

  @ApiProperty({ example: 'Asia/Seoul', description: 'IANA 시간대 이름' })
  timeZone: string;

  @ApiProperty({ enum: MapProvider, enumName: 'MapProvider', nullable: true })
  placeProvider: MapProvider | null;

  @ApiProperty({ type: String, nullable: true })
  placeId: string | null;
}

export function toStopResponse(stop: Stop): StopResponse {
  return {
    id: stop.id,
    tripId: stop.tripId,
    day: stop.day,
    order: stop.order,
    latitude: stop.latitude,
    longitude: stop.longitude,
    name: stop.name,
    kind: stop.kind,
    description: stop.description,
    memo: stop.memo,
    plannedTime: stop.plannedTime ? formatLocalTime(stop.plannedTime) : null,
    visited: stop.visited,
    visitedAt: stop.visitedAt?.toISOString() ?? null,
    timeZone: stop.timeZone,
    placeProvider: stop.placeProvider,
    placeId: stop.placeId,
  };
}
