# HANDOFF

> 최종 갱신: 2026-10-30 · 브랜치: main

## 지금 하는 일

서버 첫 단위 "서버 프로젝트 준비 + 1-1 서버 뼈대·DB 스키마"를 두 단위로 나눠 한다.

- **A. 프로젝트 준비(0단계 서버 항목): 끝남(`main` 첫 커밋).** NestJS 12 + Prisma 7 프로젝트, 로컬 PostgreSQL(Docker Compose), 단위·e2e 테스트, `GET /health`, Swagger(`/docs`).
- **B. 1-1 Prisma 스키마: 다음.** `dev` 브랜치에서 한다.

## 다음에 할 첫 단계

1. 사용자가 `main`을 push하고 `dev` 브랜치를 만들면 B를 시작한다.
2. B: 아래 "합의한 스키마 방향"대로 User·Trip·Stop·Segment·Photo 스키마와 첫 마이그레이션을 만들고, 제약이 실제로 막는지 e2e로 확인한다. 끝나면 `.github` PLAN의 0단계(서버 프로젝트, 로컬 PostgreSQL, 테스트 기본 설정)와 1-1(구조·Swagger, Prisma 스키마)을 체크한다.

## 현재 상태

- `npm run lint`, `npm run format:check`, `npm test`(8개), `npm run test:e2e`(4개) 통과. `npm run start:dev`로 뜨고 `/docs`가 열린다. DB를 멈추면 `/health`가 503이 된다.
- 로컬 DB 포트는 `127.0.0.1`에만 연다(같은 네트워크의 다른 기기는 못 붙는다).
- Prisma 스키마에는 모델이 아직 없고, 마이그레이션도 없다.
- `npm audit`: 운영 의존성 0건. 개발 도구 쪽 moderate 20건(sprintf-js 경유)은 런타임에 들어가지 않아 두었다.

## 아직 문서에 없는 결정

- **템플릿:** Nest 12 CLI의 `nest new`는 기본이 ESM + Vitest다. OVERVIEW의 "서버 테스트 Jest" 결정대로 CJS + Jest 템플릿(`@nestjs/schematics` application, `type: cjs`)으로 만들었다. lint는 Nest 12 기본인 oxlint(타입 정보 사용) + Prettier다.
- **버전:** TypeScript는 6.0.x. 7.0(Go 포트)은 ts-jest(`<7`)와 Nest CLI(`~6.0`)가 아직 받지 않는다. PostgreSQL 18은 1-7단계에서 RDS가 지원하는지 확인한다(안 되면 17, 스키마 영향 없음).
- **Prisma 7:** CLI가 `.env`를 스스로 읽지 않아서 `prisma.config.ts`가 dotenv로 읽는다. Client는 `prisma-client` 생성기(CJS)로 `src/generated/prisma/`에 만들고 커밋하지 않는다(`postinstall`이 만든다). 생성 코드가 `./x.js`로 import해서 Jest 설정 두 곳에 `.js` 떼기 매핑을 넣었다.
- **e2e DB:** `prisma migrate reset` 대신 관리 DB(`postgres`)에 붙어 테스트 DB를 `DROP ... WITH (FORCE)` → `CREATE` 한 뒤 `prisma migrate deploy`를 한다(`test/setup/global-setup.ts`). reset은 Claude Code 같은 AI 도구 안에서 실행하면 Prisma가 동의 확인으로 막을 수 있어서다.
- **API:** 기능 API는 `/v1` 아래(URI 버전), `/health`는 버전 없음(나중에 로드밸런서가 부른다). production에서는 Swagger를 열지 않는다.
- **합의한 스키마 방향(B에서 구현):**
  - 테이블·칼럼은 snake_case(`@map`), API는 앱과 같은 camelCase. 시각은 모두 `timestamptz(3)`(Prisma 기본은 시간대 없는 timestamp).
  - ID: Trip·Stop·Segment·Photo는 앱이 만든 UUID v7(`@db.Uuid`, 기본값 없음). User는 서버가 `@default(uuid(7))`.
  - User는 id·시각만. 소셜 계정과 프로필 칸은 로그인 단위에서 동의 항목을 정한 뒤 더한다.
  - 이동 수단 목록은 Segment의 `legs` jsonb(`[{mode, stopCount?, durationMinutes?}]`). 항상 통째로 바꾸고 순서가 배열에 담겨서다. 검사는 DTO에서 한다.
  - Stop `order`는 칼럼 `sort_order`(SQL 예약어). `(trip_id, day, sort_order)` 유일 제약은 `DEFERRABLE INITIALLY DEFERRED`로 SQL을 손으로 고친다(여러 장소 순서를 한 번에 밀 때 중간 충돌 방지). Prisma가 drift로 보면 "임시 음수 → 최종" 2단계 갱신으로 바꾼다.
  - Segment는 `from_stop_id`, `to_stop_id` 각각 유일(장소마다 나가는·들어오는 구간 하나 = 동선은 한 줄), 둘 다 Stop FK `Cascade`. 같은 여행인지·이웃인지는 서비스가 같은 트랜잭션에서 확인한다.
  - Photo의 Stop FK는 `Restrict`. 여행·장소·회원을 지우기 전에 서비스가 사진(S3 키)부터 처리하게 하려는 것이다. S3 키는 `users/{userId}/trips/{tripId}/photos/{photoId}.jpg`. 장소당 1장은 서비스가 지킨다.
  - Trip `copiedFromTripId`는 자기 참조 FK `SetNull`, `shareId`는 nullable unique. 목록용 인덱스 `(user_id, updated_at desc)`.
  - CHECK(SQL로 추가): Trip 박 수 ≥ 0, 기간은 둘 다 있거나 없음, 종료 ≥ 시작, 기간이 있으면 박 수 = 종료 − 시작. Stop 일차 ≥ 1, 순서 ≥ 0, 위경도 범위. Segment 양 끝이 다름, 곡률 −1~1, `legs`는 배열.

## 주의할 점

- `npm install prisma`처럼 버전 없이 설치하면 8.0 RC가 깔린다. Prisma 패키지는 버전을 지정한다.
- 저장소가 public이다. 첫 push 전에 GitHub에서 이 저장소의 Secret scanning·Push protection을 켠다(`.github` PLAN 0단계 항목).
- `POSTGRES_USER`·`POSTGRES_PASSWORD`·`POSTGRES_DB`는 Docker 볼륨을 처음 만들 때만 적용된다. 바꾸려면 `DATABASE_URL`·`TEST_DATABASE_URL`도 같이 고치고 `docker compose down -v`로 볼륨을 지우고 다시 띄운다(개발 DB 데이터가 지워진다).
- Claude Code 미리보기용 실행 설정은 작업 폴더 루트의 `../.claude/launch.json`에 있다(어느 저장소에도 들어가지 않음).
