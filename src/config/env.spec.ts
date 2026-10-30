import { NodeEnv, validateEnv } from './env';

describe('validateEnv', () => {
  const databaseUrl = 'postgresql://user:pass@localhost:5432/mapmarker';

  it('빠진 값은 기본값을 쓰고, 문자열 포트는 숫자로 바꾼다', () => {
    expect(validateEnv({ DATABASE_URL: databaseUrl })).toMatchObject({
      NODE_ENV: NodeEnv.Development,
      PORT: 3000,
      DATABASE_URL: databaseUrl,
    });
    expect(validateEnv({ DATABASE_URL: databaseUrl, PORT: '4000' }).PORT).toBe(
      4000,
    );
  });

  it('DATABASE_URL이 없으면 서버를 띄우지 않는다', () => {
    expect(() => validateEnv({})).toThrow('DATABASE_URL');
  });

  it('PostgreSQL 주소가 아니면 거절한다', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      'DATABASE_URL',
    );
  });

  it('모르는 NODE_ENV와 범위 밖 포트를 거절한다', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: databaseUrl, NODE_ENV: 'staging' }),
    ).toThrow();
    expect(() =>
      validateEnv({ DATABASE_URL: databaseUrl, PORT: '70000' }),
    ).toThrow();
  });
});
