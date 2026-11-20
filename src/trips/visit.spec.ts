import { BadRequestException } from '@nestjs/common';
import { visitData } from './visit';

describe('visitData', () => {
  const now = new Date('2026-10-21T05:00:00.000Z');

  it('보내지 않으면 방문 여부와 시각을 그대로 둔다', () => {
    expect(visitData(undefined, now)).toBeUndefined();
  });

  it('null이면 방문을 취소한다', () => {
    expect(visitData(null, now)).toEqual({ visited: false, visitedAt: null });
  });

  it('시각을 보내면 방문으로 바꾸고, 오프셋이 붙은 시각도 같은 순간으로 저장한다', () => {
    expect(visitData('2026-10-21T14:42:00+09:00', now)).toEqual({
      visited: true,
      visitedAt: new Date('2026-10-21T05:42:00.000Z'),
    });
  });

  it('지난 날짜도 받는다 (여행이 끝난 뒤 체크하거나 날짜를 고친다)', () => {
    expect(visitData('2025-01-01T00:00:00Z', now)?.visitedAt).toEqual(
      new Date('2025-01-01T00:00:00Z'),
    );
  });

  it('서버 시각보다 하루까지 뒤는 받고, 그보다 뒤면 400', () => {
    expect(visitData('2026-10-22T05:00:00.000Z', now)?.visited).toBe(true);
    expect(() => visitData('2026-10-22T05:00:00.001Z', now)).toThrow(
      BadRequestException,
    );
  });
});
