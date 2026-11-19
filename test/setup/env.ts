import { testDatabaseUrl } from './test-database';

// 테스트 파일마다 앱을 띄우기 전에: 서버가 테스트 DB를 보게 한다.
// ConfigModule은 이미 있는 환경 변수를 .env보다 앞에 둔다.
process.env.DATABASE_URL = testDatabaseUrl().toString();
process.env.NODE_ENV = 'test';
// 테스트에서만 쓰고 버리는 서명 키(CI DB 비밀번호와 같은 예외). 다른 곳에 재사용하지 않는다.
process.env.JWT_ACCESS_SECRET = 'test-only-jwt-secret-not-for-real-use';
// e2e는 카카오·네이버 검증기를 가짜로 바꿔 끼워서 이 값으로 실제 카카오에 붙지 않는다.
process.env.KAKAO_NATIVE_APP_KEY = 'test-kakao-native-app-key';
// e2e는 행안부 주소 클라이언트를 가짜로 바꿔 끼워서(setup/juso.ts) 이 값으로 실제 API에 붙지 않는다.
process.env.JUSO_ADDRESS_KEY = 'test-juso-address-key';
process.env.JUSO_COORD_KEY = 'test-juso-coord-key';
// e2e는 사진 저장소를 메모리 가짜로 바꿔 끼운다(setup/photo-storage.ts). 실수로 S3에 닿아도 없는 버킷이라 실패한다.
process.env.S3_PHOTO_BUCKET = 'test-photos-not-a-real-bucket';
process.env.AWS_PROFILE = '';
