import {
  diffSegments,
  placeStop,
  removeStop,
  RouteSegment,
  RouteStop,
} from './route';

/** 사례는 앱의 route_links_test.dart·memory_trip_repository_test.dart와 같다. */
describe('동선 규칙', () => {
  function stop(id: string, day = 1, order = 0): RouteStop {
    return { id, day, order };
  }

  /** 동선을 "일차: 장소들"로 적는다. 예: ['1: a b', '2: c'] */
  function days(stops: RouteStop[]): string[] {
    const byDay = new Map<number, string[]>();
    for (const s of stops)
      byDay.set(s.day, [...(byDay.get(s.day) ?? []), s.id]);
    return [...byDay].map(([day, ids]) => `${day}: ${ids.join(' ')}`);
  }

  function orders(stops: RouteStop[]): number[] {
    return stops.map((s) => s.order);
  }

  describe('placeStop: 넣기와 옮기기', () => {
    it('그 일차의 order 자리에 넣고 뒤 장소를 민다', () => {
      let route: RouteStop[] = [];
      route = placeStop(route, stop('a'), 1, 0);
      route = placeStop(route, stop('c'), 1, 9);
      route = placeStop(route, stop('b'), 1, 1);
      route = placeStop(route, stop('d'), 2, 0);

      expect(days(route)).toEqual(['1: a b c', '2: d']);
      expect(orders(route)).toEqual([0, 1, 2, 0]);
    });

    it('order가 장소 수보다 크면 맨 뒤, 빈 일차에는 첫 장소로 넣는다', () => {
      const route = [stop('a'), stop('b', 1, 1), stop('c', 3, 0)];

      expect(days(placeStop(route, stop('x'), 1, 99))).toEqual([
        '1: a b x',
        '3: c',
      ]);
      expect(days(placeStop(route, stop('x'), 2, 5))).toEqual([
        '1: a b',
        '2: x',
        '3: c',
      ]);
    });

    it('같은 일차 안에서 옮기고, 다른 일차로 옮기면 빈자리를 당긴다', () => {
      let route = [stop('a'), stop('b', 1, 1), stop('c', 1, 2)];

      route = placeStop(route, stop('c', 1, 2), 1, 0);
      expect(days(route)).toEqual(['1: c a b']);

      route = placeStop(route, route[1], 2, 9);
      expect(days(route)).toEqual(['1: c b', '2: a']);
      expect(orders(route)).toEqual([0, 1, 0]);
    });

    it('넣거나 옮긴 장소의 일차·순서를 새로 매긴 값으로 돌려준다', () => {
      const route = placeStop([stop('a'), stop('b', 1, 1)], stop('x'), 1, 1);

      expect(route.find((s) => s.id === 'x')).toEqual({
        id: 'x',
        day: 1,
        order: 1,
      });
    });

    it('장소의 다른 필드는 그대로 둔다', () => {
      const named = { ...stop('a'), name: '해운대' };

      expect(placeStop([named], named, 2, 0)[0]).toEqual({
        id: 'a',
        day: 2,
        order: 0,
        name: '해운대',
      });
    });
  });

  describe('removeStop: 지우기', () => {
    it('빼고 그 일차의 순서를 다시 0부터 매긴다', () => {
      const route = removeStop(
        [stop('a'), stop('b', 1, 1), stop('c', 1, 2), stop('d', 2, 0)],
        'b',
      );

      expect(days(route)).toEqual(['1: a c', '2: d']);
      expect(orders(route)).toEqual([0, 1, 0]);
    });
  });

  describe('diffSegments: 구간 다시 잇기', () => {
    function segment(id: string, from: string, to: string): RouteSegment {
      return { id, fromStopId: from, toStopId: to };
    }

    it('이웃한 쌍마다 구간을 잇는다. 일차를 넘어서도 잇는다', () => {
      const diff = diffSegments(
        [stop('a'), stop('b', 1, 1), stop('hotel', 1, 2), stop('c', 2, 0)],
        [],
      );

      expect(diff.create).toEqual([
        { fromStopId: 'a', toStopId: 'b' },
        { fromStopId: 'b', toStopId: 'hotel' },
        { fromStopId: 'hotel', toStopId: 'c' },
      ]);
      expect(diff.drop).toEqual([]);
    });

    it('아직 이웃인 쌍의 구간은 남긴다 (이동 수단과 곡률이 남는다)', () => {
      const diff = diffSegments(
        [stop('a'), stop('b', 1, 1), stop('c', 1, 2)],
        [segment('ab', 'a', 'b')],
      );

      expect(diff.drop).toEqual([]);
      expect(diff.create).toEqual([{ fromStopId: 'b', toStopId: 'c' }]);
    });

    it('더는 이웃이 아닌 쌍의 구간은 지운다 (A와 B 사이에 넣으면 A→B가 사라진다)', () => {
      const diff = diffSegments(
        [stop('a'), stop('x', 1, 1), stop('b', 1, 2)],
        [segment('ab', 'a', 'b')],
      );

      expect(diff.drop).toEqual(['ab']);
      expect(diff.create).toEqual([
        { fromStopId: 'a', toStopId: 'x' },
        { fromStopId: 'x', toStopId: 'b' },
      ]);
    });

    it('방향이 바뀐 쌍은 다른 구간이다', () => {
      const diff = diffSegments(
        [stop('b'), stop('a', 1, 1)],
        [segment('ab', 'a', 'b')],
      );

      expect(diff.drop).toEqual(['ab']);
      expect(diff.create).toEqual([{ fromStopId: 'b', toStopId: 'a' }]);
    });

    it('장소가 하나 이하면 구간이 없다', () => {
      expect(diffSegments([stop('a')], [])).toEqual({ drop: [], create: [] });
      expect(diffSegments([], [])).toEqual({ drop: [], create: [] });
    });
  });
});
