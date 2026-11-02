import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateSegmentDto } from './update-segment.dto';

describe('UpdateSegmentDto', () => {
  /** 검사 결과 오류가 있는지. API와 같이 모르는 필드도 거절한다. */
  function isValid(body: object): boolean {
    const errors = validateSync(plainToInstance(UpdateSegmentDto, body), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return errors.length === 0;
  }

  it('앱이 만드는 이동 수단 모양을 받는다', () => {
    expect(
      isValid({
        legs: [
          { mode: 'subway', stopCount: 2 },
          { mode: 'walk', durationMinutes: 5 },
        ],
        curvature: -0.4,
        type: 'normal',
      }),
    ).toBe(true);
    expect(isValid({ legs: [] })).toBe(true);
    expect(isValid({ legs: [{ mode: 'flight', durationMinutes: 5999 }] })).toBe(
      true,
    );
    expect(isValid({ legs: [{ mode: 'bus', stopCount: 99 }] })).toBe(true);
    expect(isValid({})).toBe(true);
  });

  it('토막은 5개까지다', () => {
    const leg = { mode: 'walk' };

    expect(isValid({ legs: Array(5).fill(leg) })).toBe(true);
    expect(isValid({ legs: Array(6).fill(leg) })).toBe(false);
  });

  it('정류장 수는 지하철·버스만, 1~99다', () => {
    expect(isValid({ legs: [{ mode: 'walk', stopCount: 2 }] })).toBe(false);
    expect(isValid({ legs: [{ mode: 'train', stopCount: 2 }] })).toBe(false);
    expect(isValid({ legs: [{ mode: 'subway', stopCount: 0 }] })).toBe(false);
    expect(isValid({ legs: [{ mode: 'subway', stopCount: 100 }] })).toBe(false);
    expect(isValid({ legs: [{ mode: 'subway', stopCount: 1.5 }] })).toBe(false);
  });

  it('걸리는 시간은 1~5999분 정수다 (99시간 59분)', () => {
    expect(isValid({ legs: [{ mode: 'car', durationMinutes: 0 }] })).toBe(
      false,
    );
    expect(isValid({ legs: [{ mode: 'car', durationMinutes: 6000 }] })).toBe(
      false,
    );
    expect(isValid({ legs: [{ mode: 'car', durationMinutes: 1.5 }] })).toBe(
      false,
    );
  });

  it('모르는 수단, 토막 안의 모르는 필드, 토막이 아닌 값은 거절한다', () => {
    expect(isValid({ legs: [{ mode: 'bike' }] })).toBe(false);
    expect(isValid({ legs: [{}] })).toBe(false);
    expect(isValid({ legs: [{ mode: 'walk', minutes: 5 }] })).toBe(false);
    expect(isValid({ legs: ['walk'] })).toBe(false);
    expect(isValid({ legs: { mode: 'walk' } })).toBe(false);
  });

  it('곡률은 -1~1, 종류는 normal·gpsTrack이다', () => {
    expect(isValid({ curvature: 1 })).toBe(true);
    expect(isValid({ curvature: 1.01 })).toBe(false);
    expect(isValid({ type: 'gpsTrack' })).toBe(true);
    expect(isValid({ type: 'curve' })).toBe(false);
  });

  it('null은 받지 않는다 (비우려면 legs: [], 직선은 curvature: 0)', () => {
    expect(isValid({ legs: null })).toBe(false);
    expect(isValid({ curvature: null })).toBe(false);
    expect(isValid({ type: null })).toBe(false);
    expect(isValid({ legs: [{ mode: 'subway', stopCount: null }] })).toBe(
      false,
    );
  });

  it('잇는 장소는 바꿀 수 없다 (서버가 동선으로 정한다)', () => {
    expect(isValid({ fromStopId: 'x' })).toBe(false);
  });
});
