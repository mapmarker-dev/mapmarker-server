import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsInstant, isInstant } from './instant';

describe('instant', () => {
  it('시간대(Z나 오프셋)가 붙은 ISO 8601 날짜·시각을 받는다', () => {
    for (const value of [
      '2026-10-21T05:42:00Z',
      '2026-10-21T05:42:00.123Z',
      '2026-10-21T14:42:00+09:00',
      '2026-10-21T05:42Z',
      '2028-02-29T00:00:00Z',
    ]) {
      expect(isInstant(value)).toBe(true);
    }
  });

  it('시간대가 없거나, 날짜만 있거나, 없는 날짜면 받지 않는다', () => {
    for (const value of [
      '2026-10-21T05:42:00',
      '2026-10-21',
      '2026-10-21 05:42:00Z',
      '2026-02-30T00:00:00Z',
      '2026-10-21T24:00:00Z',
      '',
      1761025320000,
      null,
    ]) {
      expect(isInstant(value)).toBe(false);
    }
  });

  it('@IsInstant()은 DTO에서 같은 규칙으로 검사한다', () => {
    class Dto {
      @IsInstant()
      at: string;
    }
    const errorsOf = (at: unknown) =>
      validateSync(plainToInstance(Dto, { at }));

    expect(errorsOf('2026-10-21T05:42:00Z')).toHaveLength(0);
    expect(errorsOf('2026-10-21T05:42:00')).toHaveLength(1);
  });
});
