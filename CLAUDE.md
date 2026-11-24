@../.github/CLAUDE.md

# mapmarker-server

MapMarker의 API 서버. NestJS 12 + Prisma 7 + PostgreSQL 18, Node 24, npm. 원격은 `mapmarker-dev/mapmarker-server`.

## 명령어

- `npm install`(Prisma Client도 `src/generated/prisma/`에 만든다), `npm run db:up` / `db:down`(Docker Compose), `npm run db:migrate`
- `npm run start:dev` → `http://localhost:3000`, Swagger `/docs`
- `npm run dev:token`: 개발 DB에 사용자를 만들고 24시간 access 토큰 출력(`-- --user <id>`로 같은 사용자)
- `npm run build`, `npm test`(단위), `npm run test:e2e`(DB 필요), `npm run lint`(oxlint), `npm run format:check`(Prettier)

## 환경 변수

- 값은 `.env`(커밋하지 않음), 목록은 `.env.example`. 더하면 `.env.example`과 `src/config/env.ts`의 `Env`도 고친다.
- 서버 코드는 `ConfigService<Env, true>`로만 읽는다(`process.env` 금지). 시작할 때 검사해서 틀리면 뜨지 않는다. `scripts/`는 `dotenv` + 같은 `validateEnv`, Prisma CLI는 `prisma.config.ts`가 읽는다.
- `JWT_ACCESS_SECRET`(32자 이상): 로컬은 직접 만든 무작위 값, e2e는 `test/setup/env.ts`의 테스트 값, 운영은 1-7에서 AWS SSM·Secrets Manager.
- `KAKAO_NATIVE_APP_KEY`: 카카오 id_token의 `aud`와 비교하는 네이티브 앱 키(비밀 아님). 틀려도 서버는 뜨고 카카오 로그인만 401.
- `JUSO_ADDRESS_KEY`·`JUSO_COORD_KEY`: 행안부 주소 검색·좌표 API 승인키(비밀). 개발 승인키는 기간이 끝나면 주소 검색이 500(로그 "승인키 오류").
- `AWS_REGION`·`AWS_PROFILE`·`S3_PHOTO_BUCKET`: 사진 버킷. 로컬 AWS 키는 프로젝트 밖 `~/.aws/credentials`의 프로필에 두고 이름만 `AWS_PROFILE`에. 운영(1-7)은 EC2 역할이라 비운다. 서버용 IAM 사용자는 버킷의 `users/*`만 다룬다.
- e2e는 `TEST_DATABASE_URL`의 DB를 매번 다시 만든다. 이름이 `_test`로 끝나야 한다.

## CI

- `.github/workflows/ci.yml`: `main`·`dev`·`test` push와 `main`으로 가는 PR마다 작업 `check`에서 `npm ci` → lint → 형식 → 단위 → 빌드 → e2e.
- 문서만 바꿔도 돌린다(건너뛰면 `main` 필수 검사가 "대기"에서 멈춘다). 돌리지 않을 push는 커밋 메시지에 `[skip ci]`.
- e2e DB는 서비스 컨테이너(`postgres:18-alpine`)이고 비밀번호는 워크플로에 적는다. Node는 `.nvmrc`(24)와 딸린 npm. 의존성을 바꾸면 lock도 커밋한다.
- Ruleset: `main`은 PR로만 병합하고 `check` 통과 필요, `dev`는 force push·삭제만 막는다. 작업 이름 `check`을 바꾸면 ruleset도 바꾼다.

## 브랜치

`main`(기본, `dev`에서 PR로만), `dev`(개발), `test`(기술 검증) 3개만 쓴다.

## 폴더 구조

```
.github/workflows/ci.yml   CI
prisma/                    schema.prisma, migrations/(커밋한다). CLI 설정은 prisma.config.ts
scripts/                   개발용 스크립트(ts-node, 빌드에 안 들어감)
src/
├─ app.setup.ts            configureApp: ValidationPipe, /v1, Prisma 오류 필터, Swagger
├─ config/                 환경 변수 검사(Env)
├─ prisma/                 PrismaModule(전역), PrismaService
├─ auth/                   소셜 로그인, 토큰·세션, 전역 가드, @Public, @CurrentUser. 제공자 검증기는 social/
├─ common/                 Prisma 오류 필터, 날짜·시각, 앱 ID 검사, @CanOmit
├─ trips/                  여행·장소·구간·후보·사진·휴지통 API. 동선 규칙은 route.ts, 사진 키와 지우기는 photo-rules.ts
├─ storage/                사진 파일 저장소(PhotoStorage, S3 구현)
├─ addresses/              주소 검색·좌표 API(행안부 도로명주소 API)
├─ health/                 상태 확인
└─ generated/prisma/       Prisma Client 생성물(커밋하지 않음)
test/                      *.e2e-spec.ts, setup/(테스트 DB, 환경 변수, 토큰·ID, 가짜 제공자·주소 API·S3, 서명 키)
```

- 기능 폴더는 `xxx.module.ts`·`xxx.controller.ts`·`xxx.service.ts`·`dto/`, 단위 테스트(`*.spec.ts`)는 같은 폴더. 컨트롤러는 요청·응답만, 규칙과 DB 접근은 서비스.

## API 규칙

- 경로는 `/v1/...`. 깔린 앱은 바로 업데이트되지 않으니 깨지는 변경은 새 버전으로 낸다. `/health`는 `VERSION_NEUTRAL`.
- 본문은 DTO(class-validator)로 검사하고 DTO에 없는 필드는 400. DTO에 `@ApiProperty`, 컨트롤러에 응답 데코레이터. production에서는 Swagger를 열지 않는다.
- JSON 필드는 앱 모델(`../mapmarker-app/lib/data/models/`)과 같은 camelCase. 날짜 `"2026-10-15"`, 예정 시각 `"09:30"`(`common/local-date.ts`·`local-time.ts`), 순간은 ISO 8601 UTC.
- 앱이 만든 ID(UUID v7)는 `common/app-id.ts`: 본문 `@IsAppId()`, 경로 `AppIdParam(name)` + `@ApiAppIdParam(name)`, 응답 `@ApiIdProperty()`. 테스트는 `test/setup/ids.ts`의 `uuidv7()`.
- PATCH에서 null로 지울 수 없는 필드는 `@CanOmit()`, 지우는 필드는 `@IsOptional()`(null도 건너뛰어서 DB까지 가면 500).
- **남의 자원은 404로 숨긴다**(`where: { id, userId }`). 403은 쓰지 않는다.
- 오류: 400 입력, 401 토큰, 404 없음·남의 것, 409 중복 ID·상태 충돌, 503 외부 서비스에 닿지 못함. 예상하는 경우는 서비스가 먼저 확인하고, 전역 `PrismaExceptionFilter`는 남은 P2002 → 409, P2025 → 404만 바꾼다. 나머지 DB 오류는 서비스가 놓친 버그라 500.

## 동선(장소·구간)

- 규칙(순서 다시 매기기, 이웃 사이 구간)은 `trips/route.ts`의 순수 함수에만 둔다. 앱 `route_links.dart`와 같은 규칙이라 함께 바꾸고 테스트 사례도 맞춘다.
- 동선을 바꾸는 요청(기간 바꾸기, 장소 넣기·옮기기·지우기, 동선에 넣기·후보로 빼기)은 트랜잭션에서 `lockOwnedTrip`으로 여행 줄부터 잠근다(소유자 확인 겸). 결과는 `route-apply.ts`의 `applyRoute`로 반영하고 `{ trip, stops, segments, candidates }` 전체를 돌려준다.
- 구간은 장소 API가 만들고 지운다(ID는 서버). 구간 API는 이동 수단·곡률·종류만 고친다. `legs` 상한(5토막, 정류장 99, 5999분)은 앱 `transport_draft.dart`와 같이 바꾼다.
- 장소·구간·후보·사진을 바꾸면 `touchTrip`으로 여행 `updatedAt`도 바꾼다(목록이 최근에 고친 순서).
- 장소·후보 주소(`address`)는 빈 문자열이 기본, 200자까지, 좌표와 따로 고친다.
- **방문 체크**는 `PATCH /v1/stops/:id`의 `visitedAt`(시간대가 붙은 ISO 8601, `@IsInstant()`)만 받는다. null이면 취소이고 `visited`는 서버가 맞춘다(`trips/visit.ts`). 서버 시각보다 하루 넘게 뒤면 400, 방문 전인데 시각이 있으면 CHECK가 막는다. 넣기와 동선에 넣기는 방문 전, 후보로 빼면 방문이 사라진다.

## 후보

- 후보(`candidates`)는 장소와 따로 된 테이블이고 넣은 순서(`CANDIDATE_ORDER`)로 보여 준다. 여행 응답에 함께 오고, 넣기·고치기는 후보 하나만 돌려준다(지우기는 204).
- 한 ID가 장소와 후보에 함께 있으면 안 된다. 여행 줄을 잠그고 `place-checks.ts`의 `ensureNotStop`·`ensureNotCandidate`로 409.
- **동선에 넣기**(`POST /v1/candidates/:id/stop`)와 **후보로 빼기**(`POST /v1/stops/:id/candidate`)는 같은 ID로 테이블을 옮기는 한 트랜잭션이고 200 + 새 동선이다. 잠근 뒤 옮길 줄을 다시 읽는다(먼저 옮겨졌으면 404).
  - 넣기: 자리는 장소 넣기와 같고, 보낸 값이 없으면 후보 값을 쓴다(좌표·장소 서비스 ID는 늘 후보 값).
  - 빼기: 장소 지우기처럼 앞뒤를 잇고 후보는 맨 뒤. 일차·순서·예정 시각·방문·시간대, 닿은 구간의 이동 수단이 사라지고, 사진은 같은 자리 장소로 넘기거나 S3 파일부터 지운다(`releasePhotos`).

## 주소 검색

- `GET /v1/addresses?query=`와 `/v1/addresses/coordinates`(검색 결과의 `ref`로 좌표). 결과를 DB에 두지 않는다. 행안부 공공데이터만 쓴다(다른 API는 약관이 결과 저장을 막는다).
- 검색어 다듬기(`address-query.ts`): "대한민국", 괄호 참고 항목, 특수문자, SQL 예약어를 빼고(행안부가 IP를 막을 수 있다), 도로명·건물번호(또는 지번)까지를 검색어로, 뒤를 상세 주소(`detail`)로 나눈다. 건물명이면 뒤의 층·호만 뗀다.
- 응답은 앞의 10건과 전체 개수 `totalCount`(좌표 키가 없어 뺀 줄은 개수에서도 뺀다). 좌표는 UTM-K라 `utm-k.ts`가 `proj4`(버전 고정)로 바꾼다.
- 오류: 다듬은 뒤 글이 없으면 400, 검색어 오류는 빈 결과, 장애·호출 과다·연결 실패·5초 초과는 503, 승인키 오류는 500(로그, 코드별 분류는 `juso.client.ts`). 로그에 승인키가 든 주소를 남기지 않는다.
- 테스트: 단위는 `fetch`를 가짜로, e2e는 `withFakeJuso(builder, fake)`.

## 휴지통

- `DELETE /v1/trips/:id`는 휴지통으로 옮긴다(`deleted_at`). 휴지통 여행은 `/v1/trash` 말고는 404다. 여행을 읽거나 고치는 쿼리를 새로 쓰면 `deletedAt: null`로 거른다(3단계 공유 링크도).
- 옮기기와 되살리기는 `updatedAt`을 바꾸지 않는다(되살리면 원래 자리). Prisma update는 `@updatedAt`을 바꿔서 SQL로 쓴다.
- 보관 기간(30일)은 `trash-retention.ts`에만 둔다. 응답 `purgeAt`으로 알리고, 기간이 끝난 여행은 예약 삭제 전에도 404다.
- 영구 삭제와 예약 삭제(`purgeExpiredJob`, 한 시간마다)는 여행 줄을 잠그고 사진(S3 파일부터)을 지운 뒤 여행을 지운다. 예약 삭제는 여행마다 따로 지워서 S3 장애인 여행만 남고 다음에 다시 지운다. 여러 번 돌려도 결과가 같다. 테스트는 `purgeExpired(now)`.

## 사진

- 장소마다 1장(서비스가 지킨다). `POST /v1/stops/:id/photo-uploads`(원본과 썸네일의 PUT 서명 주소 10분, DB에 쓰지 않음) → 앱이 S3에 PUT → `PUT /v1/stops/:id/photo`(파일 확인, 태그 떼기, 등록, 있던 사진은 지움). 지우기는 `DELETE /v1/stops/:id/photo`(없어도 204).
- 키(`photo-rules.ts`): `users/{userId}/trips/{tripId}/photos/{photoId}.jpg`와 `_thumb.jpg`, DB에는 원본 키만. 등록된 사진 ID로 업로드 주소를 달라면 409(덮어쓰기 방지).
- 업로드 주소에는 `image/jpeg`, 바이트 수(원본 5MB, 썸네일 512KB 이하), 태그 `upload=pending`이 서명된다. 수명 주기 규칙이 이 태그의 파일을 하루 뒤 지우고, 등록 트랜잭션 안에서 태그를 뗀다.
- 장소 응답의 `photo`(`{ id, url, thumbnailUrl }` 또는 null)는 1시간 GET 서명이고 응답마다 새로 만든다(`PhotoLinks`). 1-7에서 CloudFront 서명으로 바꿔도 모양은 같다.
- **사진 방향** `photoSide`(`up`·`down`·`left`·`right`, 기본 `up`)는 사진이 아니라 장소 칸이다(지도에서 사진 마커를 붙일 쪽). 장소 넣기·고치기에서 받고 null은 400. 사진을 바꾸거나 지워도 남고, 동선에 넣기는 기본값이다.
- **같은 자리 장소는 사진 하나를 함께 쓴다**(좌표가 같은 장소: 연박 숙소, 처음과 끝이 같은 공항). 앱은 그 자리에서 사진이 있는 첫 장소(주인)에만 사진을 두고 모든 밤에 보여 준다. 장소 지우기와 후보로 빼기는 `releasePhotos`로, 같은 자리 장소가 남고 그중 사진이 없으면 사진과 `photoSide`를 동선에서 먼저 오는 그 장소로 넘기고, 아니면 지운다.
- **사진을 지우는 곳은 모두 `deletePhotos`**(S3 파일부터, 그다음 줄): 사진 지우기·바꾸기, 장소 지우기와 후보로 빼기(`releasePhotos`가 넘기지 않을 때), 영구·예약 삭제. S3를 부르는 트랜잭션은 `PHOTO_TX_OPTIONS`(15초).
- S3 클라이언트는 `requestChecksumCalculation: 'WHEN_REQUIRED'`다(기본값이면 서명 주소에 빈 본문 체크섬이 들어가 업로드가 거절된다). 닿지 못하거나 5xx·429는 503, 그 밖의 4xx와 자격 증명 오류는 500(로그).
- 테스트: 단위는 `client.send`를 가짜로, e2e는 `withFakePhotoStorage(builder, fake)`(`upload()`로 앱의 PUT을 흉내, `down`으로 503). 사진을 만들거나 지우는 e2e는 꼭 끼운다.

## 인증

- 모든 경로에 `JwtAuthGuard`(`APP_GUARD`)가 걸리고, 열 경로만 `@Public()`(`/health`, `/v1/auth`의 로그인·재발급·로그아웃). 보호된 컨트롤러에는 `@ApiBearerAuth()`, `@ApiUnauthorizedResponse()`.
- 사용자는 `@CurrentUser() user: AuthUser`. `AuthUser`는 `import type`으로 불러온다(아니면 `npm run build`만 실패한다).
- access 토큰: HS256, `sub`·`iat`·`exp`만, 15분. 가드는 서명·만료만 보고 DB는 안 본다. 틀린 이유는 숨기고 모두 401. 비밀번호 로그인은 없다(개발은 `dev:token`).
- **소셜 로그인**(`social-login.service.ts`): 제공자 토큰 검증 → `(provider, providerUserId)`로 찾기, 없으면 사용자와 소셜 계정을 함께 만든다(동시 첫 로그인의 P2002는 다시 읽기) → 세션 시작. 닉네임은 가입 때만.
- **제공자 검증기**(`auth/social/`): 토큰이 틀리면 401, 닿지 못하면 503.
  - 카카오: id_token을 `RemoteJwks`(공개키 캐시)로 RS256 서명·`iss`·`aud`·`exp` 검증. access 토큰용 `JwtService`와 따로 된 인스턴스다.
  - 네이버: access token으로 `GET https://openapi.naver.com/v1/nid/me`(5초). `024`·401이면 401.
  - 제공자를 더할 때: 검증기 + `SocialProvider` enum(마이그레이션) + DTO·경로 + `verifiers`. OIDC 제공자(Apple·구글)는 `RemoteJwks`를 다시 쓴다.
- **refresh 토큰**: `<세션 ID>.<비밀>`, DB에는 비밀의 SHA-256만. 재발급은 "해시가 맞고 만료 전" 조건부 UPDATE 한 번이고, 바뀌지 않으면 세션을 지우고 401(재사용 = 탈취 의심). 로그아웃은 지금 토큰과 맞을 때만 지우고 항상 204.
- **테스트:** 단위는 `test/setup/signing-keys.ts`의 RSA 키와 `jest.spyOn(globalThis, 'fetch')`. e2e는 `withFakeSocialProviders(builder)`(토큰 `ok:<id>:<닉네임>`·`down`), 토큰만 필요하면 `createUserWithToken(app)`·`createUserWithSession(app)`.

## Prisma

- 7.10.x로 고정한다(`latest`가 8.0 RC). 올릴 때 `prisma`·`@prisma/client`·`@prisma/adapter-pg`를 함께.
- 스키마를 바꾸면 `npm run db:migrate -- --name <이름>`, SQL을 확인해 커밋한다. 적용된 마이그레이션은 고치지 않는다. `migrate dev`가 Client를 다시 만들지 않으니 `npm run prisma:generate`도 돌린다.
- Prisma가 못 쓰는 제약(CHECK, 미룰 수 있는 유일 제약)은 `-- --create-only`로 SQL만 만들어 손으로 넣고, `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`가 "No difference detected"인지 본다.
- 테이블·칼럼은 snake_case(`@map`), 시각 칼럼은 `@db.Timestamptz(3)`. 앱이 만든 ID(Trip·Stop·Candidate·Photo)는 기본값 없음, 서버가 만드는 ID만 `@default(uuid(7))`.
- 스키마 제약은 `test/schema.e2e-spec.ts`에서 실제 DB로 확인한다. 제약을 더하면 막는 경우와 통과하는 경우를 더한다.

## 코딩 규칙

- 커밋 전에 CI와 같은 `lint`, `format:check`, `test`, `build`, `test:e2e`가 통과하는지 본다.
- 테스트 이름과 주석은 한국어다.
