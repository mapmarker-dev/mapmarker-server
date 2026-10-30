import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma CLI 설정. Prisma 7부터 CLI는 .env를 스스로 읽지 않아서 dotenv로 읽는다.
// 이미 설정된 환경 변수가 .env보다 우선한다(e2e는 DATABASE_URL을 테스트 DB로 바꿔 부른다).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // generate는 DB 주소가 필요 없어서, 주소가 없는 곳(CI 설치 등)에서도 돌게 env() 대신 그대로 읽는다.
  datasource: { url: process.env.DATABASE_URL },
});
