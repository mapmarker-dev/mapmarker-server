import { formatLocalTime } from './local-time';

describe('local-time', () => {
  it('DB의 시각(1970-01-01 UTC 기준 Date)을 "09:30"으로 바꾼다', () => {
    expect(formatLocalTime(new Date('1970-01-01T09:30:00Z'))).toBe('09:30');
    expect(formatLocalTime(new Date('1970-01-01T00:05:00Z'))).toBe('00:05');
    expect(formatLocalTime(new Date('1970-01-01T23:59:00Z'))).toBe('23:59');
  });
});
