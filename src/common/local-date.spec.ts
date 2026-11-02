import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  daysBetween,
  formatLocalDate,
  IsLocalDate,
  isLocalDate,
  parseLocalDate,
} from './local-date';

describe('local-date', () => {
  it('"2026-10-15"는 UTC 0시 Date로 바꾸고, 다시 같은 문자열로 돌아온다', () => {
    const date = parseLocalDate('2026-10-15');

    expect(date.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(formatLocalDate(date)).toBe('2026-10-15');
  });

  it('달력에 있는 날만 받는다 (윤년 2월 29일은 받고, 2월 30일·13월은 거절)', () => {
    expect(isLocalDate('2028-02-29')).toBe(true);
    expect(isLocalDate('2026-02-29')).toBe(false);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
  });

  it('형식이 다르면 거절한다', () => {
    for (const value of [
      '2026-1-5',
      '20261015',
      '2026-10-15T00:00:00Z',
      ' 2026-10-15',
      '',
      20261015,
      null,
    ]) {
      expect(isLocalDate(value)).toBe(false);
    }
    expect(() => parseLocalDate('2026-02-30')).toThrow(RangeError);
  });

  it('두 날짜 사이의 날 수 (박 수)', () => {
    expect(daysBetween('2026-10-15', '2026-10-15')).toBe(0);
    expect(daysBetween('2026-10-15', '2026-10-17')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2);
    expect(daysBetween('2026-10-17', '2026-10-15')).toBe(-2);
  });

  it('@IsLocalDate()는 DTO에서 같은 규칙으로 검사한다', () => {
    class Dto {
      @IsLocalDate()
      date: string;
    }
    const errorsOf = (date: unknown) =>
      validateSync(plainToInstance(Dto, { date }));

    expect(errorsOf('2026-10-15')).toHaveLength(0);
    expect(errorsOf('2026-02-30')[0].constraints).toEqual({
      isLocalDate: 'date는 "2026-10-15" 형식의 날짜여야 합니다',
    });
  });
});
