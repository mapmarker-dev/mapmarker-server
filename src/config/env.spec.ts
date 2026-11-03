import { NodeEnv, validateEnv } from './env';

describe('validateEnv', () => {
  const databaseUrl = 'postgresql://user:pass@localhost:5432/mapmarker';
  const jwtSecret = 'a'.repeat(32);
  /** 기본값이 없어서 꼭 넣어야 하는 값. */
  const required = {
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: jwtSecret,
    KAKAO_NATIVE_APP_KEY: 'kakao-app-key',
  };

  it('빠진 값은 기본값을 쓰고, 문자열 포트는 숫자로 바꾼다', () => {
    expect(validateEnv(required)).toMatchObject({
      NODE_ENV: NodeEnv.Development,
      PORT: 3000,
      DATABASE_URL: databaseUrl,
      JWT_ACCESS_SECRET: jwtSecret,
    });
    expect(validateEnv({ ...required, PORT: '4000' }).PORT).toBe(4000);
  });

  it('DATABASE_URL이 없으면 서버를 띄우지 않는다', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: jwtSecret })).toThrow(
      'DATABASE_URL',
    );
  });

  it('PostgreSQL 주소가 아니면 거절한다', () => {
    expect(() =>
      validateEnv({ ...required, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow('DATABASE_URL');
  });

  it('JWT_ACCESS_SECRET이 없거나 32자보다 짧으면 서버를 띄우지 않는다', () => {
    expect(() => validateEnv({ DATABASE_URL: databaseUrl })).toThrow(
      'JWT_ACCESS_SECRET',
    );
    expect(() =>
      validateEnv({ ...required, JWT_ACCESS_SECRET: 'a'.repeat(31) }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('KAKAO_NATIVE_APP_KEY가 없거나 비어 있으면 서버를 띄우지 않는다', () => {
    const { KAKAO_NATIVE_APP_KEY: _, ...withoutKakao } = required;

    expect(() => validateEnv(withoutKakao)).toThrow('KAKAO_NATIVE_APP_KEY');
    expect(() =>
      validateEnv({ ...required, KAKAO_NATIVE_APP_KEY: '' }),
    ).toThrow('KAKAO_NATIVE_APP_KEY');
  });

  it('모르는 NODE_ENV와 범위 밖 포트를 거절한다', () => {
    expect(() => validateEnv({ ...required, NODE_ENV: 'staging' })).toThrow();
    expect(() => validateEnv({ ...required, PORT: '70000' })).toThrow();
  });
});
