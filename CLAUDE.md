@../.github/CLAUDE.md

# mapmarker-server

MapMarker의 API 서버. NestJS 12 + Prisma 7 + PostgreSQL 18, Node 24, npm. 원격 저장소는 `mapmarker-dev/mapmarker-server`.

## 명령어

- `npm install`: 의존성 설치(Prisma Client도 `src/generated/prisma/`에 만든다)
- `npm run db:up` / `db:down`: 로컬 DB(Docker Compose). `npm run db:migrate`: 마이그레이션 만들기·적용
- `npm run start:dev`: 실행 → `http://localhost:3000`, Swagger `/docs`
- `npm run dev:token`: 개발 DB에 사용자를 만들고 24시간 access 토큰 출력(`-- --user <id>`로 같은 사용자). Swagger Authorize에 넣는다
- `npm run build`, `npm test`(단위), `npm run test:e2e`(DB 필요), `npm run lint`(oxlint), `npm run format:check`(Prettier)

## 환경 변수

- 값은 `.env`(커밋하지 않음), 항목 목록은 `.env.example`. 변수를 더하면 `.env.example`과 `src/config/env.ts`의 `Env`도 고친다.
- 서버 코드는 `ConfigService<Env, true>`로만 읽는다(`process.env` 금지). 시작할 때 `Env`로 검사해서 틀리면 서버가 뜨지 않는다. `scripts/`는 서버 코드가 아니라 `dotenv` + 같은 `validateEnv`로 읽는다. Prisma CLI는 `prisma.config.ts`가 `.env`를 읽는다.
- `JWT_ACCESS_SECRET`(32자 이상): 로컬은 직접 만든 무작위 값(명령은 `.env.example`), e2e는 `test/setup/env.ts`의 테스트 전용 값(그래서 CI 워크플로에 없다), 운영은 1-7단계에서 AWS SSM·Secrets Manager.
- `KAKAO_NATIVE_APP_KEY`: 카카오 id_token의 `aud`와 비교하는 네이티브 앱 키. 앱에도 들어가는 값이라 비밀은 아니다. 로컬은 카카오 콘솔의 네이티브 앱 키(아무 값이어도 서버는 뜨고 카카오 로그인만 401), e2e는 `test/setup/env.ts`의 테스트 값, 운영은 1-7단계에서 다른 값과 함께 둔다. 네이버는 서버에 둘 값이 없다.
- e2e는 `TEST_DATABASE_URL`의 DB를 매번 지우고 다시 만든다. 이름이 `_test`로 끝나야 한다.

## CI

- `.github/workflows/ci.yml`: `main`·`dev`·`test` push와 `main`으로 가는 PR마다 작업 `check`에서 `npm ci` → lint → 형식 → 단위 → 빌드 → e2e. `wip/**`는 돌리지 않는다.
- 문서만 바꿔도 돌린다(건너뛰면 `main`의 필수 검사가 "대기"에서 멈춘다). 돌리지 않을 push는 커밋 메시지에 `[skip ci]`.
- e2e DB는 작업 안의 PostgreSQL 서비스 컨테이너(`postgres:18-alpine`)다. 비밀번호는 거기서만 쓰고 버리는 값이라 워크플로에 적는다. 실제 비밀값은 GitHub Secrets.
- Node는 `.nvmrc`(24 최신)와 거기 딸린 npm. 의존성을 바꾸면 lock 파일도 커밋한다(`npm ci`가 어긋나면 실패).
- Ruleset: `main`은 PR로만 병합하고 `check` 통과 필요, `dev`는 force push·삭제만 막는다. 작업 이름 `check`을 바꾸면 ruleset도 바꾼다.

## 브랜치

`main`(기본, `dev`에서 PR로만), `dev`(개발), `test`(기술 검증), `wip/<브랜치>`(인수인계용) 4개만 쓴다. 다른 브랜치는 만들지 않는다.

## 폴더 구조

```
.github/workflows/ci.yml   CI
prisma/                    schema.prisma, migrations/(커밋한다). CLI 설정은 prisma.config.ts
docker-compose.yml         로컬 PostgreSQL(개발 DB와 e2e DB)
scripts/                   개발용 스크립트(ts-node, 빌드에 안 들어감)
src/
├─ main.ts, app.module.ts  부트스트랩, 모듈
├─ app.setup.ts            configureApp: ValidationPipe, /v1, Prisma 오류 필터, Swagger
├─ config/                 환경 변수 검사(Env)
├─ prisma/                 PrismaModule(전역), PrismaService
├─ auth/                   소셜 로그인, 토큰·세션, 전역 가드, @Public, @CurrentUser. 제공자 검증기는 social/
├─ common/                 같이 쓰는 코드: Prisma 오류 필터, 날짜·시각, 앱 ID 검사, @CanOmit
├─ trips/                  여행·장소·구간·후보·휴지통 API. 동선 규칙은 route.ts
├─ health/                 상태 확인
└─ generated/prisma/       Prisma Client 생성물(커밋하지 않음)
test/                      *.e2e-spec.ts, setup/(테스트 DB, 환경 변수, 토큰·ID·가짜 제공자·서명 키 도우미)
```

- 기능 폴더는 `xxx.module.ts`·`xxx.controller.ts`·`xxx.service.ts`·`dto/`, 단위 테스트(`*.spec.ts`)는 같은 폴더. 컨트롤러는 요청·응답만, 규칙과 DB 접근은 서비스.

## API 규칙

- 경로는 `/v1/...`(URI 버전). 깔린 앱은 바로 업데이트되지 않으니 깨지는 변경은 새 버전으로 낸다. 버전과 상관없는 경로(`/health`)는 `VERSION_NEUTRAL`.
- 본문은 DTO(class-validator)로 검사하고, DTO에 없는 필드는 400. Swagger용으로 DTO에 `@ApiProperty`, 컨트롤러에 응답 데코레이터를 단다. production에서는 Swagger를 열지 않는다.
- JSON 필드 이름은 앱 모델(`../mapmarker-app/lib/data/models/`)과 같은 camelCase. 날짜 `"2026-10-15"`, 예정 시각 `"09:30"`(`common/local-date.ts`·`local-time.ts`), 순간은 ISO 8601 UTC.
- 앱이 만든 ID(UUID v7)는 `common/app-id.ts`로 받는다: 본문 `@IsAppId()`, 경로 `AppIdParam(name)` + `@ApiAppIdParam(name)`, 응답 `@ApiIdProperty()`. Swagger 기본 예시(v4)를 v7로 바꿔 준다. 테스트는 `test/setup/ids.ts`의 `uuidv7()`.
- PATCH에서 null로 지울 수 없는 필드는 `@CanOmit()`, 지우는 필드는 `@IsOptional()`(null도 건너뛰어서 DB까지 가면 500).
- **남의 자원은 404로 숨긴다**(`where: { id, userId }`). 403은 쓰지 않는다.
- 오류: 400 입력, 401 토큰, 404 없음·남의 것, 409 중복 ID·상태 충돌, 503 외부 서비스(카카오·네이버)에 닿지 못함. 예상하는 경우는 서비스가 먼저 확인하고, 전역 `PrismaExceptionFilter`는 남은 P2002 → 409, P2025 → 404만 바꾼다. 나머지 DB 오류는 서비스가 놓친 버그라 500.

## 동선(장소·구간)

- 규칙(순서 다시 매기기, 이웃 사이 구간)은 `trips/route.ts`의 순수 함수에만 둔다. 앱 `route_links.dart`와 같은 규칙이라 한쪽을 바꾸면 다른 쪽과 테스트 사례도 바꾼다.
- 동선을 확인하고 바꾸는 요청(기간 바꾸기, 장소 넣기·옮기기·지우기)은 트랜잭션에서 `lockOwnedTrip`으로 여행 줄부터 잠근다(소유자 확인 겸). 서비스는 계산 결과를 반영만 하고(`applyRoute`) `{ trip, stops, segments }` 전체를 돌려준다.
- 구간은 장소 API가 만들고 지운다(ID는 서버가 만듦). 구간 API는 이동 수단·곡률·종류 고치기만 한다.
- `legs`(jsonb)의 모양은 `TransportLegDto`가 검사한다. 상한(5토막, 정류장 99, 5999분)은 앱 `transport_draft.dart`와 같이 바꾼다.
- 장소·구간을 바꾸면 `touchTrip`으로 여행 `updatedAt`도 바꾼다(여행 목록이 최근에 고친 순서).

## 후보

- 후보(`candidates`)는 장소와 따로 된 테이블이다. 일차·순서·구간·사진이 없고 넣은 순서(`createdAt`, 같으면 `id`, `CANDIDATE_ORDER`)로 보여 준다. 설계 이유는 `.github` OVERVIEW "후보 장소".
- 여행 조회와 동선을 바꾸는 응답(`TripDetailResponse`)에 `candidates`가 함께 온다. 후보 넣기·고치기·지우기는 동선이 바뀌지 않아 후보 하나만 돌려준다(지우기는 204). 바꾸면 `touchTrip`.
- 한 ID가 장소와 후보에 함께 있으면 안 된다(동선에 넣기·후보로 빼기가 같은 ID로 옮긴다). 넣기 전에 여행 줄을 잠그고 `place-checks.ts`의 `ensureNotStop`·`ensureNotCandidate`로 다른 쪽 테이블을 보고 409. `checkPlace`(장소 서비스 ID 짝)도 장소와 같이 쓴다.
- 여행을 따라간다: 휴지통 여행의 후보는 404, 영구·예약 삭제와 회원 탈퇴 때 Cascade. 후보 하나는 휴지통 없이 바로 지운다.

## 휴지통

- `DELETE /v1/trips/:id`는 여행을 휴지통으로 옮긴다(`trips.deleted_at`). 휴지통의 여행은 `/v1/trash`(목록·되살리기·영구 삭제, `TrashService`) 말고는 없는 여행처럼 404다. 여행을 읽거나 고치는 쿼리를 새로 쓰면 `deletedAt: null`(SQL은 `deleted_at IS NULL`)로 거른다. 3단계 공유 링크 조회도 같다.
- 휴지통으로 옮기기와 되살리기는 `updatedAt`을 바꾸지 않는다(되살리면 목록의 원래 자리). Prisma의 update·updateMany는 `@updatedAt`을 바꿔서 SQL로 쓴다.
- 보관 기간(30일)은 `trips/trash-retention.ts`에만 둔다. 응답의 `purgeAt`으로 앱에 알리고, 보관 기간이 끝난 여행은 예약 삭제 전에도 휴지통 API에서 404다(`trashCutoff`).
- 예약 삭제: `TrashService.purgeExpiredJob`이 한 시간마다(`@nestjs/schedule`, 이름 `trash-purge`) 보관 기간이 끝난 여행을 지운다. 여러 번 돌려도 결과가 같아서 서버가 여러 대여도 된다. 테스트는 `purgeExpired(now)`에 시각을 넘겨 본다.
- 사진(1-3)이 생기면 영구 삭제와 예약 삭제가 사진과 S3 파일부터 지운다. 회원 탈퇴(1-6)는 휴지통을 거치지 않고 휴지통의 여행까지 바로 지운다.

## 인증

- 모든 경로에 `JwtAuthGuard`(`APP_GUARD`)가 걸리고, 열 경로만 `@Public()`(`/health`, `/v1/auth`의 로그인·재발급·로그아웃). `/docs`는 Nest 경로가 아니라 가드가 닿지 않는다.
- 사용자는 `@CurrentUser() user: AuthUser`로 꺼낸다. `AuthUser`는 `import type`으로 불러온다(아니면 `isolatedModules` 때문에 단위 테스트는 통과하고 `npm run build`만 실패한다).
- 보호된 컨트롤러에는 `@ApiBearerAuth()`, `@ApiUnauthorizedResponse()`. `AuthController`처럼 열린 경로가 섞이면 메서드에 단다.
- access 토큰: HS256, `sub`·`iat`·`exp`만, 15분(`auth/access-token.ts`). 가드는 서명·만료만 보고 DB는 안 본다. 틀린 이유는 숨기고 모두 401.
- 아이디·비밀번호 로그인은 만들지 않는다. 운영의 토큰은 소셜 로그인으로만 얻는다. 개발은 `npm run dev:token`.
- **소셜 로그인**(`social-login.service.ts`): 제공자 토큰 검증 → `(provider, providerUserId)`로 사용자 찾기, 없으면 사용자와 소셜 계정을 중첩 create로 함께 만들기(동시 첫 로그인의 P2002는 다시 읽기) → `SessionsService.start`. 닉네임은 가입 때만 넣는다.
- **제공자 검증기**(`auth/social/`, `SocialTokenVerifier`): 토큰이 틀리면 401, 제공자에 닿지 못하면 503(앱이 "다시 로그인"과 "잠시 후 다시"를 나눈다).
  - 카카오: id_token을 `RemoteJwks`(카카오 공개키 캐시)로 RS256 서명·`iss`·`aud`(`KAKAO_NATIVE_APP_KEY`)·`exp` 검증. access 토큰용 `JwtService`와 섞지 않게 따로 만든 인스턴스를 쓴다.
  - 네이버: access token으로 `GET https://openapi.naver.com/v1/nid/me`(5초). `024`·401이면 401.
  - 제공자를 더할 때: 검증기 + `SocialProvider` enum(마이그레이션) + DTO·경로 + `SocialLoginService`의 `verifiers`. OIDC 제공자(Apple·구글)는 `RemoteJwks`를 다시 쓴다.
- **refresh 토큰**(`refresh-token.ts`, `sessions.service.ts`): `<세션 ID>.<비밀>`, DB(`auth_sessions`)에는 비밀의 SHA-256만. 재발급은 "해시가 맞고 만료 전" 조건부 UPDATE 한 번으로 바꾸고(잠금 없이 동시 요청 중 하나만 성공), 바뀌지 않으면 세션을 지우고 401(예전 토큰 재사용 = 탈취 의심). 만료는 쓸 때마다 30일 뒤로. 로그아웃은 지금 토큰과 맞을 때만 지우고 항상 204.
- **테스트**: 실제 카카오·네이버에 붙지 않는다. 단위는 `test/setup/signing-keys.ts`의 RSA 키로 서명하고 `jest.spyOn(globalThis, 'fetch')`. e2e는 `withFakeSocialProviders(builder)`(`test/setup/social.ts`, 토큰 `ok:<id>:<닉네임>`·`down`·그 밖), 로그인 없이 토큰이 필요하면 `createUserWithToken(app)`·`createUserWithSession(app)`(`test/setup/auth.ts`).

## Prisma

- 7.10.x로 고정한다(`latest`가 8.0 RC). 올릴 때 버전을 정해 `prisma`·`@prisma/client`·`@prisma/adapter-pg`를 함께.
- 스키마를 바꾸면 `npm run db:migrate -- --name <이름>`, 만든 SQL을 확인해 커밋한다. 적용된 마이그레이션은 고치지 않는다. Prisma 7의 `migrate dev`는 Client를 다시 만들지 않으니 `npm run prisma:generate`도 돌린다(안 하면 새 모델이 `undefined`).
- Prisma가 못 쓰는 제약(CHECK, 미룰 수 있는 유일 제약)은 `-- --create-only`로 SQL만 만들어 손으로 넣는다. 적용 뒤 `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`가 "No difference detected"인지 본다.
- 테이블·칼럼은 snake_case(`@map`), 시각 칼럼은 `@db.Timestamptz(3)`.
- 앱이 만든 ID(Trip·Stop·Candidate·Photo)는 기본값 없음. 서버가 만드는 ID(User·Segment·SocialAccount·AuthSession)만 `@default(uuid(7))`(Prisma가 만드는 값이라 마이그레이션은 없다).
- 연결은 드라이버 어댑터(`@prisma/adapter-pg`, `PrismaService`).
- 스키마 제약은 `test/schema.e2e-spec.ts`에서 실제 DB로 확인한다. 제약을 더하면 막는 경우와 통과하는 경우를 더한다.

## 코딩 규칙

- 커밋 전에 CI와 같은 `lint`, `format:check`, `test`, `build`, `test:e2e`가 통과하는지 본다.
- 테스트 이름과 주석은 한국어다.
