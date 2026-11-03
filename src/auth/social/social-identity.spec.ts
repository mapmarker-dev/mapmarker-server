import { normalizeNickname } from './social-identity';

describe('normalizeNickname', () => {
  it('앞뒤 공백을 떼고, 비었거나 문자열이 아니면 null', () => {
    expect(normalizeNickname('  여행자 ')).toBe('여행자');
    for (const value of [undefined, null, '', '   ', 42, {}]) {
      expect(normalizeNickname(value)).toBeNull();
    }
  });

  it('30자(코드 포인트)로 자르고 이모지를 반으로 가르지 않는다', () => {
    expect(normalizeNickname('가'.repeat(31))).toBe('가'.repeat(30));
    // 이모지는 UTF-16으로 2칸이다. 30자로 자르면 이모지 30개가 그대로 남는다.
    expect(normalizeNickname('😀'.repeat(31))).toBe('😀'.repeat(30));
  });
});
