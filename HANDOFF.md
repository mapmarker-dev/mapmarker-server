# HANDOFF

> 최종 갱신: 2026-11-18 · 브랜치: dev

## 지금 하는 일

장소 검색과 동선 사이 +(PLAN "1-2 후속")를 마쳤다(결정은 `.github` OVERVIEW "지도, 외부 서비스, AI", 규칙은 `CLAUDE.md` "주소 검색"). dev → main PR을 열 차례다.

- 실제 행안부 API로 도로명(상세 주소, 괄호, "대한민국" 포함), 지번, 건물명, 좌표를 확인했다. 자연 명소(성산일출봉, 협재해수욕장)는 0건이거나 엉뚱한 건물이라 지도 누르기로 넣는다.

## 다음에 할 첫 단계

1. dev → main PR(작업 폴더의 `PR_DESCRIPTION-mapmarker-server.md`)을 merge commit으로 합친다.
2. 1-3 사진(Presigned URL). AWS 계정(PLAN 0단계)을 먼저 만든다.
   - 사진이 있는 장소를 후보로 뺄 때의 처리(지금은 409)를 정한다.
   - 지금은 사진이 달린 여행의 영구 삭제가 409이고, 예약 삭제는 그 시간 작업 전체가 실패한다. S3부터 지우게 고친다.

## 다음 단위로 넘길 것

- **1-6 회원 탈퇴:** 사용자를 지우면 소셜 계정, 세션, 여행(휴지통 포함)이 Cascade로 지워진다(사진은 S3부터). 앱이 SDK로 제공자 연결을 먼저 끊는다. 이메일이 없어 웹 삭제 요청에서 사용자를 찾을 방법(예: 앱 설정에 회원 번호)과 카카오·네이버 연결 끊기 알림(웹훅)을 정한다.
- 커밋 때 걸린 미룬 유일 제약은 `DriverAdapterError`로 와서 500이다. 여행 줄을 잠가서 생기지 않을 경우라 그대로 둔다.

## 현재 상태

- lint, 형식, 단위 147개, 빌드, e2e 278개 로컬 통과. e2e마다 pg의 `client.query()` DeprecationWarning이 한 번 나온다(Prisma 어댑터가 고칠 일).
- 카카오·네이버 로그인은 앱에서 실제 토큰으로 확인했다(로컬 `KAKAO_NATIVE_APP_KEY`가 실제 키여야 카카오가 통과).
- Prisma 7(어댑터) 오류 코드: 유일 위반 P2002, Restrict P2003, 대상 없음 P2025, CHECK 위반 P2039.
- 스키마 결정은 `prisma/schema.prisma` 주석, 손으로 넣은 제약은 `prisma/migrations/*/migration.sql` 끝에 있다.
- `npm audit --omit=dev`: high 3건(`body-parser`, `multer` ← `@nestjs/platform-express`, DoS, `npm audit fix`로 고친다고 나옴). 따로 고친다.

## 아직 문서에 없는 결정

- **템플릿:** Nest 12 기본(ESM + Vitest) 대신 OVERVIEW 결정대로 CJS + Jest. lint는 oxlint(타입 정보) + Prettier.
- **버전:** TypeScript 6.0.x(7.0은 ts-jest·Nest CLI가 아직 안 받는다). PostgreSQL 18은 1-7에서 RDS 지원을 확인한다(안 되면 17).
- **Prisma 7:** CLI가 `.env`를 안 읽어 `prisma.config.ts`가 dotenv로 읽는다. Client는 `src/generated/prisma/`(커밋 안 함, `postinstall`). 생성 코드의 `./x.js` import 때문에 Jest 설정 두 곳에 `.js` 떼기 매핑이 있고, ts-node가 못 읽어서 `scripts/dev-token.ts`는 `pg`를 쓴다.
- **e2e DB:** `prisma migrate reset`은 AI 도구 안에서 막혀서, 관리 DB에 붙어 `DROP ... WITH (FORCE)` → `CREATE` → `migrate deploy`(`test/setup/global-setup.ts`), 테스트마다 `truncateAll`.
- **장소 순서 유일 제약:** `DEFERRABLE INITIALLY DEFERRED`라 `applyRoute`가 트랜잭션 안에서 순서를 잠깐 겹치게 고쳐도 된다.
- **JWKS 직접 구현:** `jose` 6은 ESM 전용이라 `auth/social/remote-jwks.ts`로 만들었다.

## 결론이 안 난 논의

- **구글 로그인:** MVP에서 빼고 2단계에 넣자고 제안했다. 사용자 확인 전이다.

## 주의할 점

- 로컬 npm(11.6.1)과 CI npm(11.19)이 달라 `npm ci`만 실패하면 lock 차이다. 의존성은 `npx npm@11.19.1 install …`로 설치한다. install script에 `allowScripts` 경고가 막기 시작하면 `npm install-scripts approve`.
- `POSTGRES_*`는 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 URL 두 개도 고치고 `docker compose down -v`(개발 데이터 삭제).
- `npm run start:dev`를 두 개 띄우면 같은 `dist/`를 다시 빌드해 하나가 죽는다.
- Windows Git Bash의 curl은 한글을 UTF-8로 보내지 않는다. 한글 요청은 Swagger나 Node `fetch`로 본다.
- 실행 설정은 작업 폴더의 `../.claude/launch.json`(저장소 밖). 앱이 서버에 붙는 방법은 `../mapmarker-app/CLAUDE.md`.
