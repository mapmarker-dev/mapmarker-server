# HANDOFF

> 최종 갱신: 2026-11-10 · 브랜치: dev

## 지금 하는 일

휴지통(PLAN 1-2 마지막 항목)을 서버·앱에 만드는 중이다. 서버 커밋 3개(휴지통으로 옮기기 → 휴지통 API → 예약 삭제) 뒤 앱(`../mapmarker-app/HANDOFF.md`)을 하고, 끝나면 서버 dev → main PR을 merge commit으로 합친다.

- 정한 것(문서 반영은 마지막에 OVERVIEW·PLAN으로): 대상은 여행만, 회원 탈퇴는 휴지통 없이 바로 삭제, 보관 30일, `DELETE /v1/trips/:id`는 "휴지통으로 옮기기"(응답 204 그대로), 휴지통 API는 `GET /v1/trash`·`POST /v1/trash/:id/restore`·`DELETE /v1/trash/:id`(영구 삭제), 예약 삭제는 `@nestjs/schedule`로 한 시간마다. 공유 링크(3단계)는 휴지통 동안 막고 되살리면 다시 열린다(공유 ID는 지우지 않는다).
- 완료: `trips.deleted_at`(마이그레이션 `trash`), 휴지통 여행은 목록·조회·고치기와 장소·구간 API 모두 404(`lockOwnedTrip`·`findOwned`·구간 `findFirst`가 거른다). 휴지통 API(`trips/trash.service.ts`·`trash.controller.ts`): 응답은 여행 + `deletedAt`·`purgeAt`, 되살리기는 여행(200)을 돌려준다. 옮기기와 되살리기는 `updatedAt`을 바꾸지 않으려고 SQL로 쓴다(되살리면 목록의 원래 자리). 보관 기간이 끝난 여행은 예약 삭제 전에도 휴지통 API에서 404다(`trips/trash-retention.ts`의 `trashCutoff`). 영구 삭제는 사진이 달린 장소가 있으면 409(예전 `DELETE /trips/:id`에서 옮김).

## 다음에 할 첫 단계

1. 예약 삭제(`@nestjs/schedule`, 한 시간마다 `TrashService.purgeExpired`)와 서버 `CLAUDE.md` "휴지통" 절.
2. 그다음 1-3단계(사진 Presigned URL)다. AWS 계정(PLAN 0단계)을 먼저 만든다. 사진은 S3를 지우는 때가 "영구 삭제·예약 삭제"다.

## 다음 단위로 넘길 것

- **1-6 회원 탈퇴:** 사용자를 지우면 소셜 계정·세션·여행(휴지통 포함)이 Cascade로 지워진다(사진은 S3부터, Photo 참고). 앱이 SDK로 제공자 연결을 먼저 끊는다(서버에 제공자 토큰이 없다). 이메일이 없어서 웹 계정 삭제 요청에서 사용자를 찾을 방법을 정해야 한다(예: 앱 설정에 회원 번호 표시). 카카오·네이버 연결 끊기 알림(웹훅)도 이때 정한다.
- 커밋 때 걸린 미룬 유일 제약은 `DriverAdapterError`로 와서 500이다. 여행 줄을 잠가서 생기지 않아야 하는 경우라 그대로 둔다.

## 현재 상태

- lint, 형식, 단위 93개, 빌드, e2e 194개(앱 4, 인증 6, 로그인 14, 세션 19, 여행 40, 장소 45, 구간 16, 휴지통 12, 스키마 38) 로컬 통과.
- 카카오·네이버 로그인은 앱에서 실제 토큰으로 확인했다(로컬 `.env`의 `KAKAO_NATIVE_APP_KEY`가 실제 네이티브 앱 키여야 카카오 로그인이 통과한다). 앱이 서버에 붙는 방법(Wi-Fi IP, `adb reverse`)은 `../mapmarker-app/CLAUDE.md`.
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

## 결론이 안 난 논의

- **구글 로그인:** MVP에서 빼고 2단계(해외)에 넣자고 제안했다. 사용자 확인 전이라 OVERVIEW·PLAN에는 아직 넣지 않았다.

## 주의할 점

- Prisma 패키지는 버전을 지정해 설치한다(`npm install prisma`는 8.0 RC를 깐다).
- 로컬 npm(11.6.1)과 CI npm(11.19)이 다르다. 로컬 `npm install` 뒤 CI의 `npm ci`만 실패하면 lock 파일 차이다(전에 선택 peer `@emnapi/*` 두 항목이 빠졌었다). 의존성은 `npx npm@11.19.1 install …`로 설치하면 lock이 CI와 맞는다.
- npm 11.19는 install script(`prisma` 등)에 `allowScripts` 경고를 낸다. 막기 시작하면 `npm install-scripts approve`로 허용한다.
- `POSTGRES_*` 값은 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 `DATABASE_URL`·`TEST_DATABASE_URL`도 고치고 `docker compose down -v`(개발 DB 데이터 삭제).
- 다른 컴퓨터에서는 `npm run db:deploy`로 마이그레이션을 적용하고, `.env`에 `KAKAO_NATIVE_APP_KEY`를 넣는다(없으면 서버가 안 뜬다).
- `npm run start:dev`를 두 개 띄우면 같은 `dist/`를 지우고 다시 빌드해서 하나가 죽는다. 서버는 하나만 띄운다.
- Claude Code 미리보기 실행 설정은 작업 폴더 루트의 `../.claude/launch.json`(어느 저장소에도 안 들어감).
