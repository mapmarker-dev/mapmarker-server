import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  formatLocalTime,
  IsLocalTime,
  isLocalTime,
  parseLocalTime,
} from './local-time';

describe('local-time', () => {
  it('DB의 시각(1970-01-01 UTC 기준 Date)을 "09:30"으로 바꾼다', () => {
    expect(formatLocalTime(new Date('1970-01-01T09:30:00Z'))).toBe('09:30');
    expect(formatLocalTime(new Date('1970-01-01T00:05:00Z'))).toBe('00:05');
    expect(formatLocalTime(new Date('1970-01-01T23:59:00Z'))).toBe('23:59');
  });

  it('"09:30"을 DB 시각으로 바꾸고, 다시 같은 문자열로 돌아온다', () => {
    const time = parseLocalTime('09:30');

    expect(time.toISOString()).toBe('1970-01-01T09:30:00.000Z');
    expect(formatLocalTime(time)).toBe('09:30');
  });

  it('00:00~23:59의 "시:분"만 받는다', () => {
    for (const value of ['00:00', '09:30', '23:59']) {
      expect(isLocalTime(value)).toBe(true);
    }
    for (const value of [
      '24:00',
      '9:30',
      '09:60',
      '09:30:00',
      '0930',
      '',
      930,
    ]) {
      expect(isLocalTime(value)).toBe(false);
    }
    expect(() => parseLocalTime('24:00')).toThrow(RangeError);
  });

  it('@IsLocalTime()은 DTO에서 같은 규칙으로 검사한다', () => {
    class Dto {
      @IsLocalTime()
      time: string;
    }
    const errorsOf = (time: unknown) =>
      validateSync(plainToInstance(Dto, { time }));

    expect(errorsOf('09:30')).toHaveLength(0);
    expect(errorsOf('24:00')[0].constraints).toEqual({
      isLocalTime: 'time은 "09:30" 형식의 시각이어야 합니다',
    });
  });
});
