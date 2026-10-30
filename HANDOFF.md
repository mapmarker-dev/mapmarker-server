# HANDOFF

> 최종 갱신: 2026-10-30 · 브랜치: dev

## 지금 하는 일

1-1단계 서버 기본을 하고 있다. 프로젝트 준비(0단계)는 `main`에, Prisma 스키마는 `dev`에 있다. **지금은 CI 단위다.** 워크플로(`.github/workflows/ci.yml`)를 만들었고, 로컬과 Linux 컨테이너(node:24 + postgres:18-alpine)에서 같은 단계가 통과하는 것을 확인했다. **아직 GitHub에서는 돌려 보지 않았다.** 1-1의 남은 항목은 로그인, CRUD API, 여행 상태다. 1-1 서버 부분이 끝나면 `dev → main` PR로 합친다.

## 다음에 할 첫 단계

1. **CI 완료 확인** (커밋·push·GitHub 설정은 사용자가 한다)
   1. `dev`에 커밋하고 push한다 → Actions 탭에서 `CI / check`가 초록인지 본다.
   2. Ruleset을 만든다. `main`: PR 필수(승인 0), 상태 검사 `check` 필수, force push·삭제 금지. `dev`: force push·삭제 금지. 검사 이름은 워크플로가 한 번 돈 뒤에야 고를 수 있다.
   3. 빨강 확인: `test` 브랜치에서 테스트 하나를 일부러 깨뜨려 push하고, `test → main` PR에서 ❌와 병합 막힘을 본다. 확인한 뒤 PR을 닫고 원격 `test` 브랜치를 지운다.
   4. 확인되면 `.github` PLAN 1-1의 CI 항목을 체크한다.
2. 그다음 단위를 사용자와 정한다. 후보는 둘이다.
   - **로그인:** 네이버·카카오 앱 등록(0단계 미완료)이 먼저 필요하다. 소셜 계정 테이블과 동의 항목도 이때 정한다.
   - **CRUD API:** 로그인 없이 시작하려면 개발용 사용자 확인 방법(임시 헤더 등)을 정해야 한다.
3. CRUD 단위에서 할 것(이번에 미룬 것): `legs` JSON 안의 모양 검사(수단 이름, 정류장 수 1~99, 분 범위, 최대 5토막)를 TypeScript 타입 + DTO로 만든다. 앱 ID는 UUID v7 형식을 검사하고, 이미 있으면 409. PLAN 1-1의 "여행 상태" 항목은 API로 받고 돌려주는 것까지 끝나면 체크한다.

## 현재 상태

- `npm run lint`, `npm run format:check`, `npm test`(8개), `npm run build`, `npm run test:e2e`(32개: 앱 4, 스키마 28) 통과. 로컬(Windows, npm 11.6.1)과 Linux 컨테이너(Node 24.22.2, npm 11.19.1) 둘 다.
- 스키마 결정과 이유는 `prisma/schema.prisma` 주석, 손으로 넣은 제약은 `prisma/migrations/*_init/migration.sql` 끝, 큰 결정(이동 수단 JSON, 사진 Restrict·S3 키)은 `.github` OVERVIEW 결정 표에 있다.
- 로컬 DB 포트는 `127.0.0.1`에만 연다.
- `npm audit`: 운영 의존성 0건. 개발 도구 쪽 moderate 20건(sprintf-js 경유)은 런타임에 들어가지 않아 두었다.

## 아직 문서에 없는 결정

- **템플릿:** Nest 12 CLI의 `nest new`는 기본이 ESM + Vitest다. OVERVIEW의 "서버 테스트 Jest" 결정대로 CJS + Jest 템플릿(`@nestjs/schematics` application, `type: cjs`)으로 만들었다. lint는 Nest 12 기본인 oxlint(타입 정보 사용) + Prettier다.
- **버전:** TypeScript는 6.0.x. 7.0(Go 포트)은 ts-jest(`<7`)와 Nest CLI(`~6.0`)가 아직 받지 않는다. PostgreSQL 18은 1-7단계에서 RDS가 지원하는지 확인한다(안 되면 17, 스키마 영향 없음).
- **Prisma 7:** CLI가 `.env`를 스스로 읽지 않아서 `prisma.config.ts`가 dotenv로 읽는다. Client는 `prisma-client` 생성기(CJS)로 `src/generated/prisma/`에 만들고 커밋하지 않는다(`postinstall`이 만든다). 생성 코드가 `./x.js`로 import해서 Jest 설정 두 곳에 `.js` 떼기 매핑을 넣었다.
- **e2e DB:** `prisma migrate reset` 대신 관리 DB(`postgres`)에 붙어 테스트 DB를 `DROP ... WITH (FORCE)` → `CREATE` 한 뒤 `prisma migrate deploy`를 한다(`test/setup/global-setup.ts`). reset은 Claude Code 같은 AI 도구 안에서 실행하면 Prisma가 동의 확인으로 막는다(Prisma CLI에 AI 에이전트 감지 코드가 있다). 테스트마다 `truncateAll`로 테이블을 비운다.
- **API:** 기능 API는 `/v1` 아래(URI 버전), `/health`는 버전 없음(나중에 로드밸런서가 부른다). production에서는 Swagger를 열지 않는다.
- **장소 순서 유일 제약:** `DEFERRABLE INITIALLY DEFERRED`로 만들었고 Prisma가 drift로 보지 않는 것을 확인했다. 그래서 CRUD에서 순서를 밀 때 2단계 갱신이 필요 없다. 한 문장(`updateMany` increment)이나 한 트랜잭션 안에서는 잠깐 겹쳐도 되고, 커밋할 때 겹치면 트랜잭션 전체가 되돌아간다.
- **Prisma 오류 메시지:** CHECK·FK·즉시 검사 유일 제약 오류는 메시지에 제약 이름이 들어온다. 커밋 때 걸린 미룬 유일 제약 오류는 `UniqueConstraintViolation`만 오고 이름이 없다. CRUD에서 409·400으로 바꿀 때 참고한다.
- **값 다루기:** `@db.Date`는 UTC 0시 `Date`로, `@db.Time(0)`은 `1970-01-01T09:30:00Z` 같은 `Date`로 오간다. API는 `"2026-10-15"`, `"09:30"` 문자열로 바꿔서 주고받는다(CRUD 단위).
- **두 장소가 같은 여행인지, 이웃인지**는 DB가 막지 않는다. 앱이 ID를 보내므로 CRUD 서비스가 같은 트랜잭션에서 확인한다(다른 사람 여행의 장소를 가리키는 요청도 막는다).
- **lock 파일 보정(CI 단위):** 로컬 npm 11.6.1이 만든 `package-lock.json`에 `@emnapi/core`·`@emnapi/runtime`(wasm 바인딩 `@napi-rs/wasm-runtime`의 선택 peer)이 빠져 있었다. 그래서 CI 쪽 npm 11.19의 `npm ci`가 "lock과 맞지 않음"으로 실패했다. `npx npm@11.19.1 install --package-lock-only`로 두 항목만 더했다. 패키지 버전은 바뀌지 않았고 `peer` 표시만 바뀌었다. 로컬 11.6.1의 `npm ci`도 통과한다.

## 주의할 점

- `npm install prisma`처럼 버전 없이 설치하면 8.0 RC가 깔린다. Prisma 패키지는 버전을 지정한다.
- 로컬 npm(11.6.1)과 CI npm(Node 24 최신에 딸린 11.19)이 다르다. 로컬에서 `npm install`로 lock을 바꾼 뒤 CI의 `npm ci`만 실패하면 위 lock 보정과 같은 원인일 수 있다. 로컬 Node를 최신 24.x로 올리면 npm도 맞춰진다.
- npm 11.19는 의존성의 install script(`@prisma/engines`, `prisma` 등)에 `allowScripts` 경고를 낸다. 지금은 경고만 나고 검사는 통과한다. npm이 이 스크립트를 막기 시작하면 `npm install-scripts approve`로 허용 목록을 만든다.
- `POSTGRES_USER`·`POSTGRES_PASSWORD`·`POSTGRES_DB`는 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 `DATABASE_URL`·`TEST_DATABASE_URL`도 같이 고치고 `docker compose down -v`로 볼륨을 지우고 다시 띄운다(개발 DB 데이터가 지워진다).
- 개발 DB에는 이번 마이그레이션이 적용돼 있다. 다른 컴퓨터에서는 `npm run db:deploy`(또는 `db:migrate`)로 적용한다.
- Claude Code 미리보기용 실행 설정은 작업 폴더 루트의 `../.claude/launch.json`에 있다(어느 저장소에도 들어가지 않음).
