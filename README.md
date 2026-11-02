# mapmarker-server

[MapMarker](https://github.com/mapmarker-dev)의 API 서버입니다. 앱이 그린 여행 동선(여행, 장소, 구간, 사진)을 저장하고, 로그인과 공유를 맡습니다.

## 지금 상태

1-1단계(서버 기본)를 진행하고 있습니다.

- DB 스키마(User, Trip, Stop, Segment, Photo)와 CI(GitHub Actions: lint, 형식, 단위, 빌드, e2e)
- 서버가 발급한 access 토큰(JWT)을 검사하는 인증. 모든 API에 걸려 있고 `/health`만 열려 있습니다
- 여행·장소·구간 API(`/v1/trips`, `/v1/stops`, `/v1/segments`). 장소를 넣고 옮기고 지우면 서버가 이웃한 장소 사이 구간을 앱과 같은 규칙으로 다시 잇습니다
- 다음은 카카오·네이버 로그인입니다. 그전까지 로컬에서는 `npm run dev:token`으로 토큰을 받습니다

단계별 계획은 [PLAN](https://github.com/mapmarker-dev/.github/blob/main/docs/PLAN.md)에 있습니다.

## 준비물

- Node.js 24, npm 11
- Docker (Docker Compose로 PostgreSQL 18을 띄웁니다)

## 시작하기

저장소들을 같은 폴더 아래에 나란히 클론합니다. 이 저장소의 `CLAUDE.md`가 `../.github/CLAUDE.md`의 공통 규칙을 불러오기 때문입니다.

```bash
git clone https://github.com/mapmarker-dev/.github.git
git clone https://github.com/mapmarker-dev/mapmarker-server.git
cd mapmarker-server
```

`.env.example`을 `.env`로 복사합니다. `.env`는 커밋하지 않습니다.

```bash
cp .env.example .env
```

- DB 비밀번호: `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL`의 `set-me`를 직접 정한 같은 비밀번호로 바꿉니다.
- 토큰 서명 키: `JWT_ACCESS_SECRET`에는 32자 이상의 무작위 값을 넣습니다. 아래 명령의 출력을 그대로 쓰면 됩니다.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

의존성을 받고(Prisma Client도 이때 만들어집니다), DB를 켜고, 마이그레이션을 적용한 뒤 실행합니다.

```bash
npm install
npm run db:up
npm run db:deploy
npm run start:dev
```

- API: http://localhost:3000 (기능 API는 `/v1` 아래)
- 상태 확인: http://localhost:3000/health
- API 문서(Swagger): http://localhost:3000/docs

API를 부르려면 토큰이 필요합니다. 로그인이 생기기 전까지는 개발용 토큰을 받아서 Swagger 오른쪽 위 **Authorize**에 토큰만(`Bearer` 없이) 넣습니다. 개발 DB에 사용자를 하나 만들고 24시간짜리 토큰을 출력합니다.

```bash
npm run dev:token
```

## 명령어

| 하는 일 | 명령어 |
|---|---|
| 로컬 DB 켜기 / 끄기 | `npm run db:up` / `npm run db:down` |
| 마이그레이션 만들기·적용 (개발) | `npm run db:migrate` |
| 마이그레이션 적용만 | `npm run db:deploy` |
| 실행 (파일이 바뀌면 다시 시작) | `npm run start:dev` |
| 개발용 토큰 받기 (같은 사용자: `-- --user <id>`) | `npm run dev:token` |
| 빌드 / 빌드 결과 실행 | `npm run build` / `npm run start:prod` |
| 단위 테스트 | `npm test` |
| e2e 테스트 (DB 필요) | `npm run test:e2e` |
| lint / 형식 확인 | `npm run lint` / `npm run format:check` |

e2e 테스트는 같은 PostgreSQL 컨테이너 안의 테스트 DB(`.env`의 `TEST_DATABASE_URL`, 이름이 `_test`로 끝남)를 실행할 때마다 지우고 다시 만듭니다. 개발 DB는 건드리지 않습니다.

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
├─ auth/             토큰 검사(전역 가드)
├─ common/           기능끼리 같이 쓰는 코드 (날짜·시각, ID 검사, 오류 변환)
├─ trips/            여행·장소·구간 API (동선 규칙은 route.ts)
└─ health/           상태 확인
test/                e2e 테스트와 테스트 DB 준비
```
