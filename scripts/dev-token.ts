/**
 * 개발용 access 토큰 발급: `npm run dev:token` (사용자를 새로 만든다)
 *                         `npm run dev:token -- --user <사용자 ID>` (그 사용자를 다시 쓴다)
 *
 * 소셜 로그인이 생기기 전에 로컬에서 보호된 API(Swagger의 Authorize)를 부를 토큰을 얻는다.
 * 서버 경로로 만들지 않는 이유: 운영에서 열리면 누구나 아무 사용자의 토큰이나 만들 수 있다.
 * 이 스크립트는 운영 서버에 들어가지 않고(src/ 밖), production이면 실행을 거부한다.
 *
 * - 서버 코드가 아니라서 .env를 직접 읽고, 서버와 같은 validateEnv로 검사한다.
 * - ts-node로 돌린다. ts-node는 Prisma 생성 코드의 `./x.js` import를 읽지 못해서 사용자는 pg로 넣는다.
 *   ID는 PostgreSQL 18의 uuidv7()로 만든다(서버의 @default(uuid(7))과 같은 형식).
 * - 서명은 서버와 같은 jwtModuleOptions를 쓰고, 유효 시간만 24시간으로 늘린다.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import { AccessTokenPayload, jwtModuleOptions } from '../src/auth/access-token';
import { NodeEnv, validateEnv } from '../src/config/env';

const DEV_TOKEN_TTL_SECONDS = 24 * 60 * 60;

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  if (env.NODE_ENV === NodeEnv.Production) {
    throw new Error('production에서는 개발용 토큰을 만들지 않습니다');
  }
  const { values } = parseArgs({ options: { user: { type: 'string' } } });

  const db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  let userId: string;
  try {
    userId = values.user
      ? await existingUser(db, values.user)
      : await createUser(db);
  } finally {
    await db.end();
  }

  const payload: AccessTokenPayload = { sub: userId };
  const token = await new JwtService(
    jwtModuleOptions(env.JWT_ACCESS_SECRET),
  ).signAsync(payload, { expiresIn: DEV_TOKEN_TTL_SECONDS });

  console.log(`사용자: ${userId}`);
  console.log(`토큰 (24시간): ${token}`);
  console.log('Swagger(/docs)의 Authorize에 토큰만 붙여 넣으세요.');
  console.log(`같은 사용자로 다시 받기: npm run dev:token -- --user ${userId}`);
}

async function existingUser(db: Client, id: string): Promise<string> {
  // 형식이 틀린 ID는 uuid 변환에서 오류가 나므로 문자열로 비교한다.
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE id::text = $1',
    [id],
  );
  if (rows.length === 0) throw new Error(`없는 사용자입니다: ${id}`);
  return rows[0].id;
}

async function createUser(db: Client): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO users (id, updated_at) VALUES (uuidv7(), now()) RETURNING id',
  );
  return rows[0].id;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
