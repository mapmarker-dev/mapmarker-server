# mapmarker-server

[MapMarker](https://github.com/mapmarker-dev)의 API 서버입니다. 앱이 그린 여행 동선(여행, 장소, 구간, 후보 장소, 사진)을 저장하고, 로그인과 공유를 맡습니다.

## 지금 상태

1단계(MVP)를 진행하고 있습니다. 앱([mapmarker-app](https://github.com/mapmarker-dev/mapmarker-app))과 연동해 실기기에서 확인했습니다.

- DB 스키마와 CI(GitHub Actions: lint, 형식, 단위, 빌드, e2e)
- 카카오·네이버 소셜 로그인(`/v1/auth/login/kakao`, `/v1/auth/login/naver`): 앱이 SDK로 받은 토큰을 검증하고 서버의 access 토큰(15분)과 refresh 토큰(30일, 쓸 때마다 교체)을 줍니다. 재발급 `/v1/auth/refresh`, 로그아웃 `/v1/auth/logout`
- 모든 API에 access 토큰(JWT) 인증이 걸려 있고, 로그인·재발급·로그아웃과 `/health`만 열려 있습니다
- 여행·장소·구간 API(`/v1/trips`, `/v1/stops`, `/v1/segments`): 장소를 넣고 옮기고 지우면 이웃한 장소 사이 구간을 앱과 같은 규칙으로 다시 잇습니다
- 휴지통(`/v1/trash`): 지운 여행을 30일 보관하고 되살리거나 영구 삭제합니다
- 후보 장소(`/v1/candidates`): 동선에 넣기(`POST /v1/candidates/:id/stop`)와 후보로 빼기(`POST /v1/stops/:id/candidate`)
- 다음은 장소 검색과 사진 업로드(S3)입니다. 단계별 계획은 [PLAN](https://github.com/mapmarker-dev/.github/blob/main/docs/PLAN.md)에 있습니다.

## 준비물

- Node.js 24, npm 11
- Docker (Docker Compose로 PostgreSQL 18을 띄웁니다)

## 시작하기

저장소들을 같은 폴더 아래에 나란히 클론합니다(`CLAUDE.md`가 `../.github/CLAUDE.md`의 공통 규칙을 불러옵니다).

```bash
git clone https://github.com/mapmarker-dev/.github.git
git clone https://github.com/mapmarker-dev/mapmarker-server.git
cd mapmarker-server
cp .env.example .env
```

`.env`는 커밋하지 않습니다. 값을 채웁니다.

- DB 비밀번호: `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL`의 `set-me`를 직접 정한 같은 비밀번호로 바꿉니다.
- 토큰 서명 키: `JWT_ACCESS_SECRET`에 32자 이상의 무작위 값을 넣습니다(아래 명령의 출력).
- 카카오 앱 키: `KAKAO_NATIVE_APP_KEY`에 카카오 개발자 콘솔의 네이티브 앱 키를 넣습니다. 아무 값이어도 서버는 뜹니다(카카오 로그인만 401). 네이버는 서버에 넣을 값이 없습니다.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

의존성을 받고(Prisma Client도 만들어집니다), DB를 켜고, 마이그레이션을 적용한 뒤 실행합니다.

```bash
npm install
npm run db:up
npm run db:deploy
npm run start:dev
```

- API: http://localhost:3000 (기능 API는 `/v1` 아래), 상태 확인 `/health`, API 문서(Swagger) `/docs`
- 실제 로그인은 카카오·네이버 토큰이 필요해서, 로컬에서는 `npm run dev:token`으로 개발 DB에 사용자를 만들고 24시간짜리 토큰을 받아 Swagger 오른쪽 위 **Authorize**에 토큰만(`Bearer` 없이) 넣습니다.

## 명령어

| 하는 일 | 명령어 |
|---|---|
| 로컬 DB 켜기 / 끄기 | `npm run db:up` / `npm run db:down` |
| 마이그레이션 만들기·적용 (개발) / 적용만 | `npm run db:migrate` / `npm run db:deploy` |
| 실행 (파일이 바뀌면 다시 시작) | `npm run start:dev` |
| 개발용 토큰 받기 (같은 사용자: `-- --user <id>`) | `npm run dev:token` |
| 빌드 / 빌드 결과 실행 | `npm run build` / `npm run start:prod` |
| 단위 테스트 / e2e 테스트 (DB 필요) | `npm test` / `npm run test:e2e` |
| lint / 형식 확인 | `npm run lint` / `npm run format:check` |

e2e 테스트는 같은 PostgreSQL 컨테이너 안의 테스트 DB(`TEST_DATABASE_URL`, 이름이 `_test`로 끝남)를 실행마다 지우고 다시 만듭니다. 개발 DB는 건드리지 않습니다.

## 폴더 구조

```
.github/workflows/   CI (GitHub Actions)
prisma/              DB 스키마와 마이그레이션
scripts/             개발용 스크립트 (dev:token)
src/
├─ main.ts           부트스트랩
├─ app.setup.ts      전역 설정 (검증, /v1 버전, 오류 변환, Swagger)
├─ config/           환경 변수 검사
├─ prisma/           DB 연결 (PrismaService)
├─ auth/             소셜 로그인, 토큰·세션, 전역 가드
├─ common/           기능끼리 같이 쓰는 코드 (날짜·시각, ID 검사, 오류 변환)
├─ trips/            여행·장소·구간·후보·휴지통 API (동선 규칙은 route.ts)
└─ health/           상태 확인
test/                e2e 테스트와 테스트 DB 준비
```
