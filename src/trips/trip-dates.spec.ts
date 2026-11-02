import { BadRequestException } from '@nestjs/common';
import { checkTripDates } from './trip-dates';

describe('checkTripDates', () => {
  it('기간이 없으면 박 수만 있으면 된다', () => {
    expect(() => checkTripDates(5, null)).not.toThrow();
  });

  it('기간이 있으면 박 수가 종료일 − 시작일과 같아야 한다', () => {
    const dates = { start: '2026-10-15', end: '2026-10-17' };

    expect(() => checkTripDates(2, dates)).not.toThrow();
    expect(() => checkTripDates(3, dates)).toThrow(BadRequestException);
    expect(() =>
      checkTripDates(0, { start: '2026-10-15', end: '2026-10-15' }),
    ).not.toThrow();
  });

  it('종료일이 시작일보다 앞이면 400', () => {
    expect(() =>
      checkTripDates(0, { start: '2026-10-17', end: '2026-10-15' }),
    ).toThrow('종료일이 시작일보다 앞입니다');
  });
});
