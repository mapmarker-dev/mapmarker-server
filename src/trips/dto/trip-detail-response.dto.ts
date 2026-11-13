import { ApiProperty } from '@nestjs/swagger';
import type {
  Candidate,
  Segment,
  Stop,
  Trip,
} from '../../generated/prisma/client';
import {
  CandidateResponse,
  toCandidateResponse,
} from './candidate-response.dto';
import { SegmentResponse, toSegmentResponse } from './segment-response.dto';
import { StopResponse, toStopResponse } from './stop-response.dto';
import { toTripResponse, TripResponse } from './trip-response.dto';

/**
 * 여행 하나와 그 동선. 장소는 (일차, 순서)대로, 구간은 동선 순서대로, 후보는 넣은 순서대로 담는다.
 * 장소 구조를 바꾸는 요청도 이 모양을 돌려줘서, 앱은 받은 값으로 동선을 통째로 바꾸면 된다.
 * 동선에 넣기·후보로 빼기는 장소와 후보를 함께 바꿔서 후보도 같이 담는다.
 */
export class TripDetailResponse {
  @ApiProperty({ type: TripResponse })
  trip: TripResponse;

  @ApiProperty({ type: [StopResponse] })
  stops: StopResponse[];

  @ApiProperty({ type: [SegmentResponse] })
  segments: SegmentResponse[];

  @ApiProperty({ type: [CandidateResponse], description: '넣은 순서' })
  candidates: CandidateResponse[];
}

/**
 * [stops]는 동선 순서로, [candidates]는 넣은 순서로 정렬돼 있어야 한다.
 * 구간은 출발 장소의 동선 순서로 맞춘다.
 */
export function toTripDetailResponse(
  trip: Trip,
  stops: Stop[],
  segments: Segment[],
  candidates: Candidate[],
): TripDetailResponse {
  const position = new Map(stops.map((stop, index) => [stop.id, index]));
  const ordered = [...segments].sort(
    (a, b) =>
      (position.get(a.fromStopId) ?? 0) - (position.get(b.fromStopId) ?? 0),
  );
  return {
    trip: toTripResponse(trip),
    stops: stops.map(toStopResponse),
    segments: ordered.map(toSegmentResponse),
    candidates: candidates.map(toCandidateResponse),
  };
}
