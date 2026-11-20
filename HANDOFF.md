# HANDOFF

> 최종 갱신: 2026-11-20 · 브랜치: dev

## 지금 하는 일

**1-4 여행 중 기능은 끝났다**(서버 몫은 방문 체크, 앱과 실기기 확인까지 마침. 결정은 OVERVIEW "여행 중"). 다음 1-5 이미지 내보내기는 앱만 바뀌어 서버 일이 없다.

## 다음에 할 첫 단계

1. 다음 서버 일은 1-6 회원 탈퇴다(아래 "다음 단위로 넘길 것"). 다른 컴퓨터에서 받으면 마이그레이션 `stop_visit_check` 때문에 `npm run db:migrate`를 먼저 돌린다.

## 다음 단위로 넘길 것

- **1-6 회원 탈퇴:** 사용자를 지우면 소셜 계정, 세션, 여행(휴지통 포함)이 Cascade로 지워진다(사진은 S3부터). 앱이 SDK로 제공자 연결을 먼저 끊는다. 웹 삭제 요청에서 사용자를 찾을 방법(이메일이 없다, 예: 회원 번호)과 카카오·네이버 연결 끊기 웹훅을 정한다.
- 커밋 때 걸린 미룬 유일 제약은 `DriverAdapterError`로 와서 500이다. 여행 줄을 잠가서 생기지 않아 그대로 둔다.

## 현재 상태

- lint, 형식, 단위 171개, 빌드, e2e 310개 통과. e2e마다 pg `client.query()` DeprecationWarning이 한 번 나온다(Prisma 어댑터 문제).
- Prisma 7(어댑터) 오류 코드: 유일 위반 P2002, Restrict P2003, 대상 없음 P2025, CHECK 위반 P2039.
- `npm audit --omit=dev`: high 3건(`body-parser`, `multer` ← `@nestjs/platform-express`, DoS). 따로 고친다.

## 아직 문서에 없는 결정

- **방문 체크:** 전용 경로(`PUT/DELETE /visit`)는 두지 않았다. 시간대는 따로 받지 않는다(1단계 장소는 늘 `Asia/Seoul`). 하루 넘는 미래를 막는 것은 기기 시계가 틀린 경우 때문이다. 나머지 규칙은 OVERVIEW "여행 중".
- **사진**
  - 등록은 같은 장소에 같은 ID면 그대로 200, 지우기는 사진이 없어도 204다(앱이 다시 저장으로 둘 다 보내도 되게).
  - S3를 DB 트랜잭션 안에서 부른다. S3가 실패하면 되돌아가 다시 하면 되고, 커밋만 실패하는 드문 경우는 그대로 둔다.
  - DB에 있는 사진의 키만 지운다(접두어로 지우지 않는다). 등록하지 않은 파일은 태그와 수명 주기 규칙이 치운다.
  - 버킷 정책의 `s3:ListBucket`은 없는 파일의 HEAD가 403 대신 404를 받으려고 조건 없이 준다(`s3:prefix` 조건을 달면 HEAD가 403).
- **템플릿과 버전:** Nest 12 기본(ESM + Vitest) 대신 CJS + Jest, lint는 oxlint + Prettier. TypeScript 6.0.x(7.0은 ts-jest·Nest CLI가 아직 못 받는다). PostgreSQL 18은 1-7에서 RDS 지원을 확인한다(안 되면 17).
- **Prisma 7:** CLI가 `.env`를 안 읽어 `prisma.config.ts`가 dotenv로 읽는다. 생성 코드의 `./x.js` import 때문에 Jest 설정 두 곳에 `.js` 떼기 매핑이 있고, `scripts/dev-token.ts`는 ts-node가 Client를 못 읽어 `pg`를 쓴다.
- **e2e DB:** `prisma migrate reset`이 AI 도구 안에서 막혀 관리 DB에 붙어 `DROP ... WITH (FORCE)` → `CREATE` → `migrate deploy`(`test/setup/global-setup.ts`), 테스트마다 `truncateAll`.
- **JWKS 직접 구현:** `jose` 6이 ESM 전용이라 `auth/social/remote-jwks.ts`로 만들었다.

## 결론이 안 난 논의

- **구글 로그인:** MVP에서 빼고 2단계에 넣자고 제안했다. 사용자 확인 전이다.

## 주의할 점

- 로컬 npm(11.6.1)과 CI npm(11.19)이 달라 `npm ci`만 실패하면 lock 차이다. 의존성은 `npx npm@11.19.1 install …`로 설치한다(install script 경고가 설치를 막으면 `npm install-scripts approve`).
- `POSTGRES_*`는 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 URL 두 개도 고치고 `docker compose down -v`(개발 데이터 삭제).
- `npm run start:dev`를 두 개 띄우면 같은 `dist/`를 다시 빌드해 하나가 죽는다.
- Windows Git Bash의 curl은 한글을 UTF-8로 보내지 않는다. 한글 요청은 Swagger나 Node `fetch`로 본다.
- 실행 설정은 작업 폴더의 `../.claude/launch.json`(저장소 밖). 앱이 서버에 붙는 방법은 `../mapmarker-app/CLAUDE.md`.
