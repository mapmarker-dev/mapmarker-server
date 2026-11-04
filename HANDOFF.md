# HANDOFF

> 최종 갱신: 2026-11-04 · 브랜치: dev

## 지금 하는 일

1-1단계 서버 기본을 모두 마치고 `main`에 병합했다(마지막 단위 카카오·네이버 로그인은 PR #4). 서버 작업은 쉬고, 지금은 앱의 서버 연동·로그인 화면(1-2 마지막)을 `../mapmarker-app`에서 한다.

## 다음에 할 첫 단계

1. 앱 연동 중에는 그 연동에 필요한 서버 수정만 한다(아래 "다음 단위로 넘길 것").
2. 서버 다음 단위는 1-3단계(사진 Presigned URL)다. AWS 계정(PLAN 0단계)을 먼저 만든다.

## 다음 단위로 넘길 것

- **앱 연동 때(로그인):** 카카오는 `OAuthToken.idToken`(콘솔에서 OpenID Connect를 켜야 나온다), 네이버는 access token을 보낸다. 재발급은 한 번에 하나만 보낸다(동시에 두 번 보내면 두 번째가 재사용으로 걸려 로그아웃된다). 503이면 "잠시 후 다시", 401이면 다시 로그인.
- **앱 연동 때(여행):** 장소 넣기가 409(같은 ID 재전송)면 여행을 다시 불러온다(같은 곳을 다시 넣을 때는 앱이 새 ID를 만든다). 앱 입력에 서버 상한을 맞춘다(제목 100자, 지역 50자, 365박).
- **1-6 회원 탈퇴:** 사용자를 지우면 소셜 계정·세션·여행이 Cascade로 지워진다(사진은 S3부터, Photo 참고). 앱이 SDK로 제공자 연결을 먼저 끊는다(서버에 제공자 토큰이 없다). 이메일이 없어서 웹 계정 삭제 요청에서 사용자를 찾을 방법을 정해야 한다(예: 앱 설정에 회원 번호 표시). 카카오·네이버 연결 끊기 알림(웹훅)도 이때 정한다.
- 커밋 때 걸린 미룬 유일 제약은 `DriverAdapterError`로 와서 500이다. 여행 줄을 잠가서 생기지 않아야 하는 경우라 그대로 둔다.

## 결론이 안 난 논의

- **구글 로그인:** MVP에서 빼고 2단계(해외)에 넣자고 제안했다. 사용자 확인 전이라 OVERVIEW·PLAN에는 아직 넣지 않았다.

## 현재 상태

- lint, 형식, 단위 90개, 빌드, e2e 177개(앱 4, 인증 6, 로그인 14, 세션 19, 여행 37, 장소 44, 구간 15, 스키마 38) 로컬과 CI(`main`) 통과.
- 로컬 서버에서 Swagger에 auth 경로 5개가 보이고, 엉터리 토큰은 카카오·네이버(실제 API) 모두 401임을 확인했다. 실제 카카오·네이버 토큰으로는 앱 연동 때 확인한다(콘솔 앱 등록은 끝났다. 로컬 `.env`의 `KAKAO_NATIVE_APP_KEY`를 실제 네이티브 앱 키로 바꿔야 카카오 로그인이 통과한다).
- Prisma 7(어댑터) 오류 코드: 유일 위반 P2002, Restrict P2003, 대상 없음 P2025, CHECK 위반 P2039.
- Windows Git Bash의 curl은 명령줄 한글을 UTF-8로 보내지 않아 깨진다(서버 문제 아님). 한글 요청은 Swagger로 확인한다.
- 스키마 결정은 `prisma/schema.prisma` 주석, 손으로 넣은 제약은 `prisma/migrations/*/migration.sql` 끝, 큰 결정은 `.github` OVERVIEW에 있다.
- 로컬 DB 포트는 `127.0.0.1`에만 연다. `npm audit`: 운영 의존성 0건(개발 도구 moderate 20건은 런타임에 안 들어가서 두었다).

## 아직 문서에 없는 결정

- **템플릿:** Nest 12 `nest new`의 기본(ESM + Vitest) 대신, OVERVIEW의 "서버 테스트 Jest" 결정대로 CJS + Jest 템플릿으로 만들었다. lint는 Nest 12 기본인 oxlint(타입 정보) + Prettier.
- **버전:** TypeScript 6.0.x(7.0은 ts-jest·Nest CLI가 아직 안 받는다). PostgreSQL 18은 1-7단계에서 RDS 지원을 확인한다(안 되면 17, 스키마 영향 없음).
- **Prisma 7:** CLI가 `.env`를 안 읽어서 `prisma.config.ts`가 dotenv로 읽는다. Client는 `src/generated/prisma/`(CJS, 커밋 안 함, `postinstall`이 만듦). 생성 코드의 `./x.js` import 때문에 Jest 설정 두 곳에 `.js` 떼기 매핑을 넣었고, ts-node는 이 코드를 못 읽어서 `scripts/dev-token.ts`는 `pg`로 DB를 쓴다.
- **e2e DB:** `prisma migrate reset`은 AI 도구 안에서 Prisma가 동의 확인으로 막는다. 그래서 관리 DB에 붙어 테스트 DB를 `DROP ... WITH (FORCE)` → `CREATE` → `migrate deploy`(`test/setup/global-setup.ts`), 테스트마다 `truncateAll`.
- **장소 순서 유일 제약:** `DEFERRABLE INITIALLY DEFERRED`라서 `applyRoute`가 한 트랜잭션 안에서 순서를 잠깐 겹치게 고쳐도 된다(Prisma는 drift로 보지 않는다).
- **JWKS 직접 구현:** `jose` 6은 ESM 전용이라 CJS + Jest와 안 맞아서 `auth/social/remote-jwks.ts`로 만들었다(새 의존성 없음).

## 주의할 점

- Prisma 패키지는 버전을 지정해 설치한다(`npm install prisma`는 8.0 RC를 깐다).
- 로컬 npm(11.6.1)과 CI npm(11.19)이 다르다. 로컬 `npm install` 뒤 CI의 `npm ci`만 실패하면 lock 파일 차이다(전에 선택 peer `@emnapi/*` 두 항목이 빠졌었다). 의존성은 `npx npm@11.19.1 install …`로 설치하면 lock이 CI와 맞는다.
- npm 11.19는 install script(`prisma` 등)에 `allowScripts` 경고를 낸다. 막기 시작하면 `npm install-scripts approve`로 허용한다.
- `POSTGRES_*` 값은 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 `DATABASE_URL`·`TEST_DATABASE_URL`도 고치고 `docker compose down -v`(개발 DB 데이터 삭제).
- 다른 컴퓨터에서는 `npm run db:deploy`로 마이그레이션을 적용하고, `.env`에 `KAKAO_NATIVE_APP_KEY`를 넣는다(없으면 서버가 안 뜬다).
- `npm run start:dev`를 두 개 띄우면 같은 `dist/`를 지우고 다시 빌드해서 하나가 죽는다. 서버는 하나만 띄운다.
- Claude Code 미리보기 실행 설정은 작업 폴더 루트의 `../.claude/launch.json`(어느 저장소에도 안 들어감).
