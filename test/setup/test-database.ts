import 'dotenv/config';

/**
 * e2e 테스트 DB 주소(.env의 TEST_DATABASE_URL).
 * 테스트는 이 DB를 지우고 다시 만드므로, 이름이 `_test`로 끝나지 않으면 멈춘다.
 */
export function testDatabaseUrl(): URL {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      '.env에 TEST_DATABASE_URL을 넣어 주세요 (.env.example 참고)',
    );
  }
  const url = new URL(value);
  const name = testDatabaseName(url);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `테스트 DB 이름은 소문자·숫자·밑줄로 쓰고 _test로 끝나야 합니다: "${name}"`,
    );
  }
  return url;
}

export function testDatabaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}
