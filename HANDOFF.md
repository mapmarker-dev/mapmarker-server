# HANDOFF

> 최종 갱신: 2026-11-02 · 브랜치: dev

## 지금 하는 일

1-1단계 서버 기본을 하고 있다. 프로젝트 준비(0단계)는 `main`에, Prisma 스키마와 CI는 `dev`에 있다. CI 단위는 끝났다(확인용 PR #1은 닫았다, ruleset 규칙은 `CLAUDE.md`의 CI 절).

**지금은 "자체 JWT 인증 + Trip/Stop/Segment CRUD" 단위를 하고 있다. A(인증), B(Trip CRUD·여행 상태), C-1(장소 쓰기)을 마쳤다. 다음은 C-2(구간 고치기)다.** 1-1의 남은 항목은 CRUD API(구간), 소셜 로그인이다(PLAN 1-1을 이 순서로 고쳤다). 1-1 서버 부분이 끝나면 `dev → main` PR로 합친다(PR로만 합칠 수 있다).

## 다음에 할 첫 단계

1. **이번 단위는 "자체 JWT 인증 + Trip/Stop/Segment CRUD"다(사용자와 합의).** 소셜 로그인은 그다음 단위다.
   - 왜: CRUD는 처음부터 "누구의 여행인가"(소유자 확인)가 필요하다. 임시 헤더 같은 가짜 방식은 나중에 걷어 내야 하지만, 서버가 발급한 access 토큰을 검사하는 가드는 그대로 남는다. 소셜 로그인은 "네이버·카카오 토큰 → 사용자 찾기·만들기 → 이 JWT 발급"만 더하면 된다. 그동안 사용자가 네이버·카카오 앱 등록(0단계)을 한다.
   - 소셜 로그인 단위에서 정할 것: 소셜 계정 테이블, 동의 항목, refresh 토큰(설계만 정함: 아래).
2. **설계는 확정됐다.** 순서는 A 인증 → B Trip → C-1 장소 → C-2 구간 → D 문서. **A·B·C-1은 끝났다**(규칙은 `CLAUDE.md`의 API 규칙·인증 절). **다음은 C-2다:** `PATCH /v1/segments/:segmentId`(legs·curvature·type, 응답은 `Segment`, ID 그대로). legs DTO 검사는 `trips/transport-leg.ts`의 수단 목록을 쓰고, 소유자는 `where: { id, trip: { userId } }`로 확인해 404, 구간을 고치면 여행 `updatedAt`도 바꾼다(`StopsService.update`와 같음). 끝나면 PLAN 1-1의 CRUD 항목을 체크하고 D로 간다.

## 이번 단위 설계 (확정, 구현하면서 CLAUDE.md·코드 주석으로 옮기고 여기서 지운다)

- **refresh(소셜 로그인 단위에서 만든다):** JWT가 아닌 무작위 문자열, DB에는 해시만, 쓸 때마다 교체, 로그아웃·탈퇴 때 지움, 30일 정도. DB에 있어야 강제로 끊을 수 있어서다.
- **경로(C-2):** `PATCH /v1/segments/:segmentId`는 `Segment`를 돌려준다. 경로 ID는 `AppIdParam`·`@ApiAppIdParam`으로 받는다.
- **검사(C-2):** legs 최대 5토막·수단 7개·`stopCount` 1~99(지하철·버스만, 다른 수단에 보내면 400)·`durationMinutes` 1~5999(정수), 토막 안의 모르는 필드 400, `curvature` −1~1, `type`은 `normal`·`gpsTrack`. 모두 null은 받지 않는다(`@CanOmit()`).
- **오류:** 커밋 때 걸린 미룬 유일 제약은 Prisma 오류가 아니라 `DriverAdapterError`(kind `UniqueConstraintViolation`)로 와서 필터에 걸리지 않고 500이다. 여행 줄을 잠그면 생기지 않아야 하는 버그라 그대로 둔다. 같은 장소 ID로 다시 보내면 409라서, 앱 연동 때 "넣기가 409면 여행을 다시 불러온다"로 처리한다(같은 곳을 다시 넣을 때는 앱이 새 ID를 만든다).

## 현재 상태

- `npm run lint`, `npm run format:check`, `npm test`(46개), `npm run build`, `npm run test:e2e`(119개: 앱 4, 인증 6, 여행 37, 장소 44, 스키마 28) 로컬 통과(2026-11-02). A·B는 `dev`에 push했다. C-1은 아직 커밋 전이다.
- `npm run dev:token` 토큰으로 여행 만들기 201 → 상태 바꾸기 200 → 조회 200 → 박 수 불일치 400 → 지우기 204를 손으로 확인했다. Windows Git Bash의 curl은 명령줄의 한글을 UTF-8이 아닌 코드 페이지로 보내 깨진다(서버 문제 아님, e2e에서는 한글이 맞게 오간다). 한글이 든 요청은 Swagger로 확인한다.
- Prisma 7(어댑터) 오류 코드: 유일 위반 P2002, Restrict P2003, 대상 없음 P2025, CHECK 위반 P2039.
- `@nestjs/jwt`는 CI와 같은 npm 11.19.1(`npx npm@11.19.1 install`)로 설치해서 lock 파일이 CI의 `npm ci`와 맞는다.
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
