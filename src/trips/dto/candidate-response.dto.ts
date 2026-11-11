import { ApiProperty } from '@nestjs/swagger';
import { ApiIdProperty } from '../../common/app-id';
import type { Candidate } from '../../generated/prisma/client';
import { MapProvider, StopKind } from '../../generated/prisma/enums';

/** 후보 장소. 필드 이름과 모양은 앱 모델(Candidate)과 같다. 일차·순서·예정 시각·방문은 없다. */
export class CandidateResponse {
  @ApiIdProperty()
  id: string;

  @ApiIdProperty()
  tripId: string;

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

  @ApiProperty({ enum: MapProvider, enumName: 'MapProvider', nullable: true })
  placeProvider: MapProvider | null;

  @ApiProperty({ type: String, nullable: true })
  placeId: string | null;
}

export function toCandidateResponse(candidate: Candidate): CandidateResponse {
  return {
    id: candidate.id,
    tripId: candidate.tripId,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    name: candidate.name,
    kind: candidate.kind,
    description: candidate.description,
    memo: candidate.memo,
    placeProvider: candidate.placeProvider,
    placeId: candidate.placeId,
  };
}
