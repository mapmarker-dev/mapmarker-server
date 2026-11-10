import { purgeAt, TRASH_RETENTION_DAYS, trashCutoff } from './trash-retention';

describe('휴지통 보관 기간', () => {
  it('30일이다', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it('지운 시각에서 30일 뒤 같은 시각에 지운다', () => {
    expect(purgeAt(new Date('2026-11-10T08:30:00.123Z'))).toEqual(
      new Date('2026-12-10T08:30:00.123Z'),
    );
  });

  it('기준 시각은 지금에서 30일 전이다. 이 시각까지 지운 여행은 보관 기간이 끝났다', () => {
    const now = new Date('2026-12-10T08:30:00.123Z');
    const cutoff = trashCutoff(now);

    expect(cutoff).toEqual(new Date('2026-11-10T08:30:00.123Z'));
    expect(purgeAt(cutoff)).toEqual(now);
  });
});
