/**
 * 동선 규칙. DB를 모르는 순수 함수다. 앱의 route_links.dart·메모리 저장소와 같은 규칙이라 사례도 같이 테스트한다.
 * - 장소는 (일차, 순서)로 늘어선 한 줄이고, 순서는 일차마다 0부터 빈칸 없이 매긴다.
 * - 구간은 이웃한 두 장소 사이마다 하나다. 일차를 넘어서도 잇는다.
 * - 이웃이 그대로인 쌍의 구간은 남고(이동 수단·곡률 유지), 이웃이 바뀐 쌍의 구간은 사라진다.
 */

export interface RouteStop {
  id: string;
  day: number;
  order: number;
}

export interface RouteSegment {
  id: string;
  fromStopId: string;
  toStopId: string;
}

/**
 * [stop]을 [day]일차의 [order] 자리에 넣는다. 이미 동선에 있으면 옮긴다.
 * order가 그 일차의 장소 수보다 크면 맨 뒤에 넣는다. [stops]는 동선 순서여야 하고, 결과도 동선 순서다.
 */
export function placeStop<T extends RouteStop>(
  stops: readonly T[],
  stop: T,
  day: number,
  order: number,
): T[] {
  const days = groupByDay(stops.filter((s) => s.id !== stop.id));
  const list = days.get(day) ?? [];
  list.splice(Math.min(Math.max(order, 0), list.length), 0, { ...stop, day });
  days.set(day, list);
  return numbered(days);
}

/** [stopId] 장소를 빼고 순서를 다시 매긴다. */
export function removeStop<T extends RouteStop>(
  stops: readonly T[],
  stopId: string,
): T[] {
  return numbered(groupByDay(stops.filter((s) => s.id !== stopId)));
}

/** 동선 [stops]에 맞추려면 지울 구간 ID와 새로 이을 쌍. 남는 구간은 어디에도 들지 않는다. */
export function diffSegments(
  stops: readonly RouteStop[],
  existing: readonly RouteSegment[],
): { drop: string[]; create: { fromStopId: string; toStopId: string }[] } {
  const pairs = stops
    .slice(1)
    .map((to, i) => ({ fromStopId: stops[i].id, toStopId: to.id }));
  const key = (p: { fromStopId: string; toStopId: string }) =>
    `${p.fromStopId}>${p.toStopId}`;
  const wanted = new Set(pairs.map(key));
  const kept = new Set(
    existing.filter((s) => wanted.has(key(s))).map((s) => key(s)),
  );
  return {
    drop: existing.filter((s) => !wanted.has(key(s))).map((s) => s.id),
    create: pairs.filter((p) => !kept.has(key(p))),
  };
}

/** 동선 순서인 장소를 일차별 목록으로. 목록 안은 순서대로다. */
function groupByDay<T extends RouteStop>(
  stops: readonly T[],
): Map<number, T[]> {
  const days = new Map<number, T[]>();
  for (const stop of stops) {
    days.set(stop.day, [...(days.get(stop.day) ?? []), stop]);
  }
  return days;
}

/** 일차 순서로 늘어놓고, 순서를 일차마다 0부터 다시 매긴다. */
function numbered<T extends RouteStop>(days: Map<number, T[]>): T[] {
  return [...days.keys()]
    .sort((a, b) => a - b)
    .flatMap((day) =>
      days.get(day)!.map((stop, order) => ({ ...stop, order })),
    );
}
