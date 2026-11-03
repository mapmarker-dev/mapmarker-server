# HANDOFF

> 최종 갱신: 2026-11-02 · 브랜치: dev

## 지금 하는 일

1-1단계 서버 기본의 마지막 단위 **카카오·네이버 로그인**을 구현한다. 스키마·CI·자체 JWT 인증·Trip/Stop/Segment CRUD는 PR #2, #3으로 `main`에 병합했고, `dev`를 `main`에 맞췄다(fast-forward). 커밋 4개로 나눈다.

1. 스키마: `SocialAccount`, `AuthSession`, `User.nickname` (커밋함)
2. refresh 세션: 발급·교체·폐기, `POST /v1/auth/refresh`, `/logout` ← **마쳤다(커밋 전)**
3. 제공자 검증기: JWKS 캐시, 카카오 id_token, 네이버 프로필 API, `KAKAO_NATIVE_APP_KEY`
4. 로그인 경로 `POST /v1/auth/login/kakao`·`/naver`, 가짜 제공자 e2e, 문서(서버 CLAUDE.md 인증 절, `.github` PLAN·OVERVIEW·HANDOFF) → `dev` push CI → `dev → main` PR

## 다음에 할 첫 단계

사용자가 2단계를 커밋하면 3단계(제공자 검증기)를 시작한다. 로그인 경로(4단계)는 `SessionsService.start(userId)`로 토큰 쌍을 받는다.

## 아직 문서에 없는 결정 (4단계에서 OVERVIEW·CLAUDE.md로 옮긴다)

- **카카오:** 앱이 **id_token**(콘솔에서 OIDC 켜기)을 보낸다. 서버는 `https://kauth.kakao.com/.well-known/jwks.json` 공개키로 RS256 서명, `iss=https://kauth.kakao.com`, `aud=네이티브 앱 키`, `exp`를 본다. 로그인마다 카카오를 부르지 않고, Apple·구글도 같은 방식이라 검증 코드를 다시 쓴다. nonce는 MVP에서 뺀다(Apple 때 다시 본다).
- **네이버:** 앱이 **access token**을 보낸다(`flutter_naver_login` 2.1.1은 id_token을 주지 않는다). 서버는 `GET https://openapi.naver.com/v1/nid/me`를 불러 `resultcode "00"`의 `response.id`를 쓴다. `aud`는 없지만 네이버 사용자 ID가 앱마다 달라서 다른 앱의 토큰으로 기존 계정에 닿지 못한다. 서버에 네이버 값은 필요 없다.
- **JWKS:** 새 의존성 없이 직접 만든다(1시간 캐시, 모르는 `kid`면 1분에 최대 한 번 다시 받기, 서명은 `JwtService`에 RS256만). `jose` 6은 ESM 전용이라 CJS + Jest와 안 맞는다.
- **오류:** 소셜 토큰·refresh 토큰이 틀리면 401, 제공자에 닿지 못하면(5초 타임아웃, 5xx) 503. 409는 쓰지 않는다(첫 로그인이 동시에 오면 다시 읽어 200). 로그아웃은 모르는 토큰도 204.
- **refresh 토큰:** `<세션 ID>.<무작위 32바이트 base64url>`, DB에는 비밀의 SHA-256만. 교체는 "비밀이 맞고 만료 전"을 조건으로 한 UPDATE 한 번이라(`updateManyAndReturn`) 잠금 없이도 같은 토큰이 동시에 오면 한쪽만 바뀐다. 쓸 때마다 만료를 30일 뒤로 민다. 로그아웃은 지금 토큰과 맞을 때만 지운다(예전 토큰으로는 안 지움). 세션 ID는 맞는데 비밀이 다르면 예전 토큰의 재사용(탈취)으로 보고 세션을 지운다. 로그인할 때 그 사용자의 만료된 세션을 치운다.
- **계정·동의:** 카카오와 네이버로 따로 들어오면 다른 사용자다(자동 연결 없음, 이메일을 받지 않음). 받는 것은 닉네임(선택 동의, 가입 때만)뿐이고 제공자 토큰은 저장하지 않는다.
- **구글 로그인:** MVP에서 빼고 2단계(해외)에 넣자고 제안했다. 4단계에서 OVERVIEW·PLAN에 넣을 때 사용자에게 다시 확인한다.

## 다음 단위로 넘길 것

- **앱 연동 때:** 토큰 재발급은 한 번에 하나만 보낸다(동시에 두 번 보내면 두 번째가 재사용으로 걸려 로그아웃된다). 탈퇴(1-6) 때는 앱이 SDK로 제공자 연결을 먼저 끊는다(서버에 제공자 토큰이 없다).
- **1-6 회원 탈퇴:** 이메일이 없어서 웹 계정 삭제 요청에서 사용자를 찾을 방법을 정해야 한다(예: 앱 설정에 회원 번호 표시). 카카오·네이버 연결 끊기 알림(웹훅)도 이때 정한다.
- **앱 연동 때:** 장소 넣기가 409(같은 ID 재전송)면 여행을 다시 불러온다(같은 곳을 다시 넣을 때는 앱이 새 ID를 만든다). 앱 입력에 서버 상한을 맞춘다(제목 100자, 지역 50자, 365박).
- 커밋 때 걸린 미룬 유일 제약은 `DriverAdapterError`로 와서 500이다. 여행 줄을 잠가서 생기지 않아야 하는 경우라 그대로 둔다.

## 현재 상태

- lint, 형식, 단위 59개, 빌드, e2e 163개(앱 4, 인증 6, 세션 19, 여행 37, 장소 44, 구간 15, 스키마 38) 로컬 통과(2026-11-02). `dev`·`main` CI는 1단계 전까지 초록.
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

## 주의할 점

- Prisma 패키지는 버전을 지정해 설치한다(`npm install prisma`는 8.0 RC를 깐다).
- 로컬 npm(11.6.1)과 CI npm(11.19)이 다르다. 로컬 `npm install` 뒤 CI의 `npm ci`만 실패하면 lock 파일 차이다(전에 선택 peer `@emnapi/*` 두 항목이 빠졌었다). 의존성은 `npx npm@11.19.1 install …`로 설치하면 lock이 CI와 맞는다.
- npm 11.19는 install script(`prisma` 등)에 `allowScripts` 경고를 낸다. 막기 시작하면 `npm install-scripts approve`로 허용한다.
- `POSTGRES_*` 값은 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 `DATABASE_URL`·`TEST_DATABASE_URL`도 고치고 `docker compose down -v`(개발 DB 데이터 삭제).
- 다른 컴퓨터에서는 `npm run db:deploy`로 마이그레이션을 적용한다.
- `npm run start:dev`를 두 개 띄우면 같은 `dist/`를 지우고 다시 빌드해서 하나가 죽는다. 서버는 하나만 띄운다.
- Claude Code 미리보기 실행 설정은 작업 폴더 루트의 `../.claude/launch.json`(어느 저장소에도 안 들어감).
