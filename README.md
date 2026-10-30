# mapmarker-server

[MapMarker](https://github.com/mapmarker-dev)의 API 서버입니다. 앱이 그린 여행 동선(여행, 장소, 구간, 사진)을 저장하고, 로그인과 공유를 맡습니다.

## 지금 상태

- 0단계(준비): NestJS + Prisma 프로젝트, 로컬 PostgreSQL, 테스트 기본 설정을 마쳤습니다. 지금은 상태 확인(`GET /health`)과 Swagger 문서만 있습니다.
- 다음은 1-1단계의 DB 스키마(User, Trip, Stop, Segment, Photo), 그다음 로그인과 여행 API입니다.

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

`.env.example`을 `.env`로 복사하고 `set-me`를 직접 정한 비밀번호로 바꿉니다(세 군데 모두 같은 값). `.env`는 커밋하지 않습니다.

```bash
cp .env.example .env
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

## 명령어

| 하는 일 | 명령어 |
|---|---|
| 로컬 DB 켜기 / 끄기 | `npm run db:up` / `npm run db:down` |
| 마이그레이션 만들기·적용 (개발) | `npm run db:migrate` |
| 마이그레이션 적용만 | `npm run db:deploy` |
| 실행 (파일이 바뀌면 다시 시작) | `npm run start:dev` |
| 빌드 / 빌드 결과 실행 | `npm run build` / `npm run start:prod` |
| 단위 테스트 | `npm test` |
| e2e 테스트 (DB 필요) | `npm run test:e2e` |
| lint / 형식 확인 | `npm run lint` / `npm run format:check` |

e2e 테스트는 같은 PostgreSQL 컨테이너 안의 테스트 DB(`.env`의 `TEST_DATABASE_URL`, 이름이 `_test`로 끝남)를 실행할 때마다 지우고 다시 만듭니다. 개발 DB는 건드리지 않습니다.

## 폴더 구조

```
prisma/              DB 스키마와 마이그레이션
src/
├─ main.ts           부트스트랩
├─ app.setup.ts      전역 설정 (검증, /v1 버전, Swagger)
├─ config/           환경 변수 검사
├─ prisma/           DB 연결 (PrismaService)
└─ <기능>/           기능 모듈 (module, controller, service, dto)
test/                e2e 테스트와 테스트 DB 준비
```
