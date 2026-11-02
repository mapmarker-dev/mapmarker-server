# HANDOFF

> 최종 갱신: 2026-11-02 · 브랜치: dev

## 지금 하는 일

1-1단계 서버 기본. `main`은 0단계 상태이고, 스키마·CI·**자체 JWT 인증·Trip/Stop/Segment CRUD 단위**는 모두 `dev`에 커밋했다. PLAN 1-1에서 남은 것은 소셜 로그인이다.

## 다음에 할 첫 단계

1. **`dev → main` PR.** 소셜 로그인을 기다리지 않고 이 단위에서 합치기로 했다(사용자 결정). 사용자가 PR을 열고 CI(`check`) 통과 뒤 병합한다. 병합은 merge commit으로 해야 `dev`를 그대로 이어 쓸 수 있다.
2. **다음 서버 단위: 카카오·네이버 로그인.** 사용자의 앱 등록(0단계)이 먼저다. "소셜 토큰 검증 → 사용자 찾기·만들기 → 이미 만든 access 토큰 발급"만 더하고 가드·CRUD는 그대로 쓴다. 정할 것: 소셜 계정 테이블, 동의 항목, refresh 토큰.

## 다음 단위로 넘길 것

- **refresh 토큰(설계만 정함):** JWT가 아닌 무작위 문자열, DB에는 해시만, 쓸 때마다 교체, 로그아웃·탈퇴 때 지움, 30일 정도. DB에 있어야 강제로 끊을 수 있다.
- **앱 연동 때:** 장소 넣기가 409(같은 ID 재전송)면 여행을 다시 불러온다(같은 곳을 다시 넣을 때는 앱이 새 ID를 만든다). 앱 입력에 서버 상한을 맞춘다(제목 100자, 지역 50자, 365박).
- 커밋 때 걸린 미룬 유일 제약은 `DriverAdapterError`로 와서 500이다. 여행 줄을 잠가서 생기지 않아야 하는 경우라 그대로 둔다.

## 현재 상태

- lint, 형식, 단위 54개, 빌드, e2e 134개(앱 4, 인증 6, 여행 37, 장소 44, 구간 15, 스키마 28) 로컬 통과(2026-11-02). A·B·C-1은 CI도 초록.
- Prisma 7(어댑터) 오류 코드: 유일 위반 P2002, Restrict P2003, 대상 없음 P2025, CHECK 위반 P2039.
- Windows Git Bash의 curl은 명령줄 한글을 UTF-8로 보내지 않아 깨진다(서버 문제 아님). 한글 요청은 Swagger로 확인한다.
- 스키마 결정은 `prisma/schema.prisma` 주석, 손으로 넣은 제약은 `prisma/migrations/*_init/migration.sql` 끝, 큰 결정은 `.github` OVERVIEW에 있다.
- 로컬 DB 포트는 `127.0.0.1`에만 연다. `npm audit`: 운영 의존성 0건(개발 도구 moderate 20건은 런타임에 안 들어가서 두었다).

## 아직 문서에 없는 결정

- **템플릿:** Nest 12 `nest new`의 기본(ESM + Vitest) 대신, OVERVIEW의 "서버 테스트 Jest" 결정대로 CJS + Jest 템플릿으로 만들었다. lint는 Nest 12 기본인 oxlint(타입 정보) + Prettier.
- **버전:** TypeScript 6.0.x(7.0은 ts-jest·Nest CLI가 아직 안 받는다). PostgreSQL 18은 1-7단계에서 RDS 지원을 확인한다(안 되면 17, 스키마 영향 없음).
- **Prisma 7:** CLI가 `.env`를 안 읽어서 `prisma.config.ts`가 dotenv로 읽는다. Client는 `src/generated/prisma/`(CJS, 커밋 안 함, `postinstall`이 만듦). 생성 코드의 `./x.js` import 때문에 Jest 설정 두 곳에 `.js` 떼기 매핑을 넣었고, ts-node는 이 코드를 못 읽어서 `scripts/dev-token.ts`는 `pg`로 DB를 쓴다.
- **e2e DB:** `prisma migrate reset`은 AI 도구 안에서 Prisma가 동의 확인으로 막는다. 그래서 관리 DB에 붙어 테스트 DB를 `DROP ... WITH (FORCE)` → `CREATE` → `migrate deploy`(`test/setup/global-setup.ts`), 테스트마다 `truncateAll`.
- **장소 순서 유일 제약:** `DEFERRABLE INITIALLY DEFERRED`라서 `applyRoute`가 한 트랜잭션 안에서 순서를 잠깐 겹치게 고쳐도 된다(Prisma는 drift로 보지 않는다).

## 주의할 점

- Prisma 패키지는 버전을 지정해 설치한다(`npm install prisma`는 8.0 RC를 깐다).
- 로컬 npm(11.6.1)과 CI npm(11.19)이 다르다. 로컬 `npm install` 뒤 CI의 `npm ci`만 실패하면 lock 파일 차이다(전에 선택 peer `@emnapi/*` 두 항목이 빠졌었다). 의존성은 `npx npm@11.19.1 install …`로 설치하면 lock이 CI와 맞는다.
- npm 11.19는 install script(`prisma` 등)에 `allowScripts` 경고를 낸다. 막기 시작하면 `npm install-scripts approve`로 허용한다.
- `POSTGRES_*` 값은 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 `DATABASE_URL`·`TEST_DATABASE_URL`도 고치고 `docker compose down -v`(개발 DB 데이터 삭제).
- 다른 컴퓨터에서는 `npm run db:deploy`로 마이그레이션을 적용한다.
- `npm run start:dev`를 두 개 띄우면 같은 `dist/`를 지우고 다시 빌드해서 하나가 죽는다. 서버는 하나만 띄운다.
- Claude Code 미리보기 실행 설정은 작업 폴더 루트의 `../.claude/launch.json`(어느 저장소에도 안 들어감).
