import { testDatabaseUrl } from './test-database';

// 테스트 파일마다 앱을 띄우기 전에: 서버가 테스트 DB를 보게 한다.
// ConfigModule은 이미 있는 환경 변수를 .env보다 앞에 둔다.
process.env.DATABASE_URL = testDatabaseUrl().toString();
process.env.NODE_ENV = 'test';
