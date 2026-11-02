@../.github/CLAUDE.md

# mapmarker-server

MapMarker의 API 서버. NestJS 12 + Prisma 7 + PostgreSQL 18, Node 24, 패키지 매니저는 npm. 소스는 `src/`, e2e 테스트는 `test/`. 원격 저장소는 `mapmarker-dev/mapmarker-server`.

## 명령어

- 의존성 설치: `npm install` (Prisma Client도 이때 `src/generated/prisma/`에 만든다)
- 로컬 DB 켜기·끄기: `npm run db:up` / `npm run db:down` (Docker Compose)
- 마이그레이션 만들기·적용: `npm run db:migrate` (`prisma migrate dev`)
- 실행: `npm run start:dev` → API `http://localhost:3000`, Swagger `http://localhost:3000/docs`
- 개발용 토큰: `npm run dev:token` (개발 DB에 사용자를 만들고 24시간 access 토큰 출력, `-- --user <id>`로 같은 사용자 재사용). Swagger의 Authorize에 붙여 넣는다
- 빌드: `npm run build`
- 단위 테스트: `npm test`
- e2e 테스트: `npm run test:e2e` (DB가 켜져 있어야 한다)
- lint: `npm run lint` (oxlint), 형식 확인: `npm run format:check` (Prettier)

## 환경 변수

- 값은 `.env`에 둔다. `.env`는 커밋하지 않고, 항목 목록은 `.env.example`에 둔다. 새 변수를 추가하면 `.env.example`과 `src/config/env.ts`의 `Env`도 함께 고친다.
- 서버 코드는 `ConfigService<Env, true>`로만 값을 읽는다. `process.env`를 직접 읽지 않는다. 시작할 때 `Env`로 검사해서, 빠지거나 틀리면 서버가 뜨지 않는다. `scripts/`는 서버 코드가 아니라서 `dotenv`로 읽고 같은 `validateEnv`로 검사한다.
- `JWT_ACCESS_SECRET`(32자 이상)은 로컬 `.env`에 직접 만든 무작위 값을 둔다(만드는 명령은 `.env.example`). e2e는 `test/setup/env.ts`의 테스트 전용 값을 써서 CI 워크플로에는 없다. 운영 값은 1-7단계에서 AWS(SSM Parameter Store 또는 Secrets Manager)에 둔다.
- Prisma CLI는 `prisma.config.ts`가 `.env`의 `DATABASE_URL`을 읽는다.
- e2e는 `TEST_DATABASE_URL`의 DB를 매번 지우고 다시 만든다. DB 이름은 `_test`로 끝나야 한다.

## CI

- GitHub Actions 워크플로 `.github/workflows/ci.yml`. `main`·`dev`·`test`에 push할 때와 `main`으로 가는 PR마다, 작업 하나(`check`)에서 `npm ci` → lint → 형식 확인 → 단위 테스트 → 빌드 → e2e 순서로 돌린다. 빨리 끝나는 검사가 앞이라 실패하면 거기서 멈춘다. `wip/**`는 작업 중 커밋이라 돌리지 않는다.
- 문서만 바꾼 커밋도 돌린다. 건너뛰면 `main`의 필수 검사가 "대기"에서 멈춰 PR을 병합할 수 없다. 돌리지 않을 push는 커밋 메시지에 `[skip ci]`를 넣는다(`dev`는 검사가 필수가 아니라 막히지 않는다).
- e2e는 작업 안에서 띄우는 PostgreSQL 서비스 컨테이너(로컬과 같은 `postgres:18-alpine`)로 돌린다. 이 DB의 비밀번호는 그 컨테이너에서만 쓰고 버리는 값이라 워크플로에 적는다. 다른 DB에 재사용하지 않는다. 실제 서비스에 쓰는 값(배포 키 등)은 GitHub Secrets에 둔다.
- Node는 `.nvmrc`의 24 중 최신, npm은 그 Node에 딸린 버전이다. `npm ci`는 `package-lock.json`이 `package.json`과 맞지 않으면 실패하므로 의존성을 바꾸면 lock 파일을 함께 커밋한다.
- 브랜치 보호(Settings → Rules → Rulesets): `main`은 PR로만 병합하고 `check` 통과가 필요하다(force push·삭제 금지). `dev`는 force push·삭제만 막는다. 작업 이름 `check`을 바꾸면 ruleset의 필수 검사도 바꾼다.

## 브랜치

이 저장소는 브랜치를 아래 4개만 운영한다. 다른 브랜치를 새로 만들지 않는다.

- `main`: 기본 브랜치. `dev`에서 PR로만 합친다(CI 통과 필요)
- `dev`: 개발할 때
- `test`: 기술 검증 같은 테스트가 필요할 때
- `wip/<브랜치>` : 공통 규칙의 인수인계용 임시 브랜치

## 폴더 구조

```
.github/workflows/
└─ ci.yml              GitHub Actions CI
prisma/
├─ schema.prisma       DB 스키마
└─ migrations/         마이그레이션 SQL (커밋한다)
prisma.config.ts       Prisma CLI 설정
docker-compose.yml     로컬 PostgreSQL (개발 DB와 e2e 테스트 DB)
scripts/               개발용 스크립트 (ts-node로 실행, 빌드에 들어가지 않음)
src/
├─ main.ts             부트스트랩 → configureApp → listen
├─ app.module.ts       전역 모듈(Config, Prisma)과 기능 모듈
├─ app.setup.ts        configureApp: ValidationPipe, URI 버전(/v1), Swagger
├─ config/             환경 변수 검사(Env)
├─ prisma/             PrismaModule(전역), PrismaService
├─ auth/               access 토큰 서명·검사, 전역 가드, @Public, @CurrentUser
├─ generated/prisma/   Prisma Client 생성물 (커밋하지 않음)
└─ <기능>/             기능 모듈. 예: health, (다음) trips, photos
test/
├─ *.e2e-spec.ts       e2e 테스트
└─ setup/              테스트 DB 준비(global-setup), 테스트용 환경 변수, 토큰 도우미(auth.ts)
```

- 기능 폴더는 `xxx.module.ts`, `xxx.controller.ts`, `xxx.service.ts`, `dto/`로 시작하고, 단위 테스트(`*.spec.ts`)는 같은 폴더에 둔다.
- 컨트롤러는 요청·응답만 다루고, 규칙과 DB 접근은 서비스에 둔다.
- 기능끼리 같이 쓸 코드는 `common/`으로 옮긴다(지금: Prisma 오류 필터, 날짜·시각 문자열 변환, 앱 ID 검사, `@CanOmit()`).

## API 규칙

- 경로는 `/v1/...`이다(`app.setup.ts`의 URI 버전). 깔린 앱은 바로 업데이트되지 않으므로, 깨지는 변경은 새 버전으로 낸다. `/health`처럼 버전과 상관없는 경로는 `VERSION_NEUTRAL`로 둔다.
- 요청 본문은 DTO 클래스(class-validator)로 검사한다. DTO에 없는 필드는 400으로 거절한다.
- Swagger에 보이도록 DTO에 `@ApiProperty`, 컨트롤러에 응답 데코레이터를 단다. production(`NODE_ENV`)에서는 Swagger를 열지 않는다.
- JSON 필드 이름은 앱 모델(`../mapmarker-app/lib/data/models/`)과 같은 camelCase로 맞춘다.
- 날짜는 `"2026-10-15"`, 예정 시각은 `"09:30"` 문자열로 주고받는다(`common/local-date.ts`·`local-time.ts`). 순간(`createdAt` 등)은 ISO 8601 UTC 문자열이다.
- 앱이 만든 ID(UUID v7)는 `common/app-id.ts`로 받는다. 본문 필드는 `@IsAppId()`, 경로는 `AppIdParam(name)` + 메서드에 `@ApiAppIdParam(name)`, 응답의 ID는 `@ApiIdProperty()`. 틀리면 400("…는 앱이 만든 UUID v7이어야 합니다")이다. Swagger 기본 예시는 v4라서 그대로 보내면 400이 나므로, 이 도우미들이 예시를 v7로 바꿔 둔다.
- PATCH DTO에서 null로 지울 수 없는 필드는 `@CanOmit()`, null로 지우는 필드는 `@IsOptional()`을 쓴다. `@IsOptional()`은 null도 건너뛰어서 null이 DB까지 가면 500이 난다.
- **남의 자원은 404로 숨긴다.** 쿼리를 사용자 ID로 걸러(`where: { id, userId }`) "없음"과 "남의 것"이 똑같이 보이게 한다. 403은 쓰지 않는다.
- 여행의 동선 규칙(기간, 장소 순서)을 확인하고 바꾸는 요청은 트랜잭션 안에서 `lockOwnedTrip(tx, userId, tripId)`로 여행 줄부터 잠근다(소유자 확인 겸, 404).
- 오류: 400 입력, 401 토큰, 404 없음·남의 것, 409 중복 ID·상태 충돌. 예상하는 경우는 서비스가 먼저 확인하고, 전역 `PrismaExceptionFilter`는 남은 P2002 → 409, P2025 → 404만 바꾼다. 다른 DB 오류는 서비스가 놓친 버그라 500으로 둔다.
- 테스트용 UUID v7은 `test/setup/ids.ts`의 `uuidv7()`로 만든다.

## 인증

- 모든 경로에 `JwtAuthGuard`가 걸린다(`AuthModule`의 `APP_GUARD`). 토큰 없이 열 경로만 `@Public()`을 붙인다(지금은 `/health`). Swagger(`/docs`)는 Nest 경로가 아니라서 가드가 닿지 않는다.
- 요청한 사용자는 컨트롤러 인자 `@CurrentUser() user: AuthUser`로 꺼낸다. `AuthUser`는 인터페이스라 `import type`으로 불러온다(데코레이터가 붙은 인자 타입은 `isolatedModules`에서 type import여야 한다. 단위 테스트는 통과하고 `npm run build`만 실패한다).
- 보호된 컨트롤러에는 `@ApiBearerAuth()`와 `@ApiUnauthorizedResponse()`를 단다.
- access 토큰은 HS256, 내용은 `sub`(사용자 ID)·`iat`·`exp`만, 15분이다(`src/auth/access-token.ts`). 가드는 서명·만료만 보고 DB는 보지 않는다. 틀린 이유는 드러내지 않고 모두 401이다.
- 아이디·비밀번호 로그인은 만들지 않는다. 운영에서 토큰을 얻는 길은 소셜 로그인뿐이고, 로컬은 `npm run dev:token`, 테스트는 `test/setup/auth.ts`의 `createUserWithToken(app)`을 쓴다.

## Prisma

- 버전은 7.10.x로 고정한다. npm의 `latest` 태그가 8.0 RC를 가리키고 있어서, 올릴 때는 버전을 직접 정해 `prisma`와 `@prisma/client`, `@prisma/adapter-pg`를 함께 올린다.
- 스키마를 바꾸면 `npm run db:migrate -- --name <이름>`으로 마이그레이션을 만들고, 만든 SQL을 확인해 함께 커밋한다. 적용된 마이그레이션 파일은 고치지 않는다.
- Prisma가 표현하지 못하는 제약(CHECK, 미룰 수 있는 유일 제약)은 `npm run db:migrate -- --create-only --name <이름>`으로 SQL만 만든 뒤 손으로 넣고 적용한다. 적용한 뒤 `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma`가 "No difference detected"인지 확인한다.
- 테이블·칼럼은 snake_case(`@map`), 필드는 앱 모델과 같은 camelCase. 시각 칼럼은 `@db.Timestamptz(3)`를 붙인다(Prisma 기본은 시간대 없는 timestamp).
- 앱이 만든 ID(Trip·Stop·Segment·Photo)에는 기본값을 두지 않는다. 서버가 만드는 ID만 `@default(uuid(7))`.
- DB 연결은 드라이버 어댑터(`@prisma/adapter-pg`)로 한다(`PrismaService`).
- 스키마 제약은 `test/schema.e2e-spec.ts`에서 실제 DB로 확인한다. 제약을 더하면 여기에 막는 경우와 통과하는 경우를 더한다.

## 코딩 규칙

- 커밋 전에 CI와 같은 `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run test:e2e`가 통과하는지 확인한다.
- 테스트 이름과 주석은 한국어로 쓴다(앱 저장소와 같음).
