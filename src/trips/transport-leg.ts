/** 이동 수단. 앱의 TransportMode와 같은 이름이다. */
export const TRANSPORT_MODES = [
  'walk',
  'subway',
  'bus',
  'train',
  'car',
  'flight',
  'ferry',
] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

/**
 * 이동 한 토막. Segment.legs(jsonb)에 이 모양의 배열로 담는다.
 * 앱의 TransportLeg에서 걸리는 시간(Duration)은 분 단위 정수로 바꾼다.
 */
export interface TransportLeg {
  mode: TransportMode;
  /** 지나는 정류장 수. 지하철·버스만. */
  stopCount?: number;
  /** 걸리는 시간(분). */
  durationMinutes?: number;
}
