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

/** 정류장 수를 세는 수단. 앱의 countsStops와 같다. */
export const STOP_COUNTING_MODES: readonly TransportMode[] = ['subway', 'bus'];

/** 앱 입력 화면의 상한(transport_draft.dart): 토막 5개, 정류장 99개, 99시간 59분. */
export const MAX_LEGS = 5;
export const MAX_STOP_COUNT = 99;
export const MAX_DURATION_MINUTES = 99 * 60 + 59;

/**
 * 이동 한 토막. Segment.legs(jsonb)에 이 모양의 배열로 담는다.
 * 앱의 TransportLeg에서 걸리는 시간(Duration)은 분 단위 정수로 바꾼다.
 * interface가 아니라 type인 이유: Prisma의 JSON 입력 타입(인덱스 시그니처)에 그대로 넣을 수 있다.
 */
export type TransportLeg = {
  mode: TransportMode;
  /** 지나는 정류장 수. 지하철·버스만. */
  stopCount?: number;
  /** 걸리는 시간(분). */
  durationMinutes?: number;
};
