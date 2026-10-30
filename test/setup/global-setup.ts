import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
import { testDatabaseName, testDatabaseUrl } from './test-database';

/**
 * e2e를 시작할 때 한 번: 테스트 DB를 지우고 다시 만든 뒤 마이그레이션을 모두 적용한다.
 * 매번 빈 DB에서 시작해서 지난 실행이 남긴 데이터에 영향받지 않는다.
 */
export default async function globalSetup(): Promise<void> {
  const url = testDatabaseUrl();
  await recreateDatabase(url);

  try {
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          PRISMA_HIDE_UPDATE_MESSAGE: '1',
        },
        stdio: 'pipe',
      },
    );
  } catch (error) {
    // 성공할 때는 조용히 두고, 실패하면 Prisma 출력을 보여 준다.
    const { stdout, stderr } = error as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `테스트 DB 마이그레이션 실패\n${stdout?.toString() ?? ''}${stderr?.toString() ?? ''}`,
    );
  }
}

/** 같은 서버의 관리용 DB(postgres)에 붙어서 테스트 DB를 다시 만든다. */
async function recreateDatabase(url: URL): Promise<void> {
  const name = testDatabaseName(url);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    // 이름은 testDatabaseUrl()이 [a-z0-9_]만 허용해서 그대로 넣어도 안전하다.
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}
