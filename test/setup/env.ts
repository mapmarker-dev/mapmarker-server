import { testDatabaseUrl } from './test-database';

// 테스트 파일마다 앱을 띄우기 전에: 서버가 테스트 DB를 보게 한다.
// ConfigModule은 이미 있는 환경 변수를 .env보다 앞에 둔다.
process.env.DATABASE_URL = testDatabaseUrl().toString();
process.env.NODE_ENV = 'test';
// 테스트에서만 쓰고 버리는 서명 키(CI DB 비밀번호와 같은 예외). 다른 곳에 재사용하지 않는다.
process.env.JWT_ACCESS_SECRET = 'test-only-jwt-secret-not-for-real-use';
// e2e는 카카오·네이버 검증기를 가짜로 바꿔 끼워서 이 값으로 실제 카카오에 붙지 않는다.
process.env.KAKAO_NATIVE_APP_KEY = 'test-kakao-native-app-key';
