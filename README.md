# mapmarker-server

[MapMarker](https://github.com/mapmarker-dev)의 API 서버입니다. 앱이 그린 여행 동선(여행, 장소, 구간, 후보 장소, 사진)을 저장하고, 로그인과 공유를 맡습니다.

## 지금 상태

1단계(MVP)를 진행하고 있고, 앱([mapmarker-app](https://github.com/mapmarker-dev/mapmarker-app))과 실기기에서 확인했습니다. 지금은 사진(S3)을 만들고 있습니다([PLAN](https://github.com/mapmarker-dev/.github/blob/main/docs/PLAN.md)).

- 카카오·네이버 로그인(`/v1/auth`): 앱이 SDK로 받은 토큰을 검증하고 access 토큰(15분)과 refresh 토큰(30일, 쓸 때마다 교체)을 줍니다. 로그인·재발급·로그아웃과 `/health` 말고는 모두 access 토큰이 필요합니다
- 여행·장소·구간(`/v1/trips`, `/v1/stops`, `/v1/segments`): 장소를 넣고 옮기고 지우면 구간을 앱과 같은 규칙으로 다시 잇습니다
- 휴지통(`/v1/trash`): 지운 여행을 30일 보관합니다
- 후보 장소(`/v1/candidates`): 동선에 넣기와 후보로 빼기
- 사진(`/v1/stops/:id/photo-uploads`, `/v1/stops/:id/photo`): 앱이 줄인 원본과 썸네일을 서버가 S3에 직접 올리고 등록합니다. 장소를 지우거나 후보로 빼거나 여행을 영구 삭제하면 S3 파일도 지웁니다
- 주소 검색(`/v1/addresses`): 행안부 도로명주소 API로 주소나 건물명을 찾고 좌표를 받습니다
- CI(GitHub Actions): lint, 형식, 단위, 빌드, e2e

## 시작하기

Node.js 24(npm 11)와 Docker가 필요합니다. 저장소들을 같은 폴더 아래에 나란히 클론합니다(`CLAUDE.md`가 `../.github/CLAUDE.md`를 불러옵니다).

```bash
git clone https://github.com/mapmarker-dev/.github.git
git clone https://github.com/mapmarker-dev/mapmarker-server.git
cd mapmarker-server
cp .env.example .env
```

`.env`(커밋하지 않음)의 `set-me`를 채웁니다. 항목 설명은 `.env.example`에 있습니다.

- DB 비밀번호: `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL`에 같은 값
- `JWT_ACCESS_SECRET`: 32자 이상 무작위 값(`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`)
- `KAKAO_NATIVE_APP_KEY`: 카카오 네이티브 앱 키(아무 값이어도 서버는 뜨고 카카오 로그인만 401)
- `JUSO_ADDRESS_KEY`, `JUSO_COORD_KEY`: 행안부 주소 검색·좌표제공 API 승인키(없으면 서버가 뜨지 않습니다)
- `S3_PHOTO_BUCKET`, `AWS_PROFILE`: 사진 버킷 이름과 `~/.aws/credentials`의 프로필 이름. 값이 틀려도 서버는 뜨고 사진 요청만 실패합니다

```bash
npm install
npm run db:up
npm run db:deploy
npm run start:dev
```

- API는 http://localhost:3000(`/v1` 아래), 상태 확인 `/health`, Swagger `/docs`
- 로컬에서는 `npm run dev:token`으로 개발 DB에 사용자를 만들고 24시간 토큰을 받아 Swagger **Authorize**에 토큰만(`Bearer` 없이) 넣습니다.

## 명령어

| 하는 일 | 명령어 |
|---|---|
| 로컬 DB 켜기 / 끄기 | `npm run db:up` / `npm run db:down` |
| 마이그레이션 만들기·적용 / 적용만 | `npm run db:migrate` / `npm run db:deploy` |
| 실행(파일이 바뀌면 다시 시작) | `npm run start:dev` |
| 개발용 토큰(같은 사용자: `-- --user <id>`) | `npm run dev:token` |
| 빌드 / 실행 | `npm run build` / `npm run start:prod` |
| 단위 / e2e 테스트(DB 필요) | `npm test` / `npm run test:e2e` |
| lint / 형식 확인 | `npm run lint` / `npm run format:check` |

e2e는 같은 컨테이너의 테스트 DB(`TEST_DATABASE_URL`, 이름이 `_test`로 끝남)를 실행마다 다시 만들고, 개발 DB는 건드리지 않습니다.

## 폴더 구조

```
.github/workflows/   CI
prisma/              DB 스키마와 마이그레이션
scripts/             개발용 스크립트(dev:token)
src/
├─ app.setup.ts      전역 설정(검증, /v1, 오류 변환, Swagger)
├─ config/           환경 변수 검사
├─ prisma/           DB 연결
├─ auth/             소셜 로그인, 토큰·세션, 전역 가드
├─ common/           같이 쓰는 코드(날짜·시각, ID 검사, 오류 변환)
├─ trips/            여행·장소·구간·후보·사진·휴지통 API(동선 규칙은 route.ts)
├─ storage/          사진 파일 저장소(S3)
├─ addresses/        주소 검색·좌표 API
└─ health/           상태 확인
test/                e2e 테스트와 테스트 준비
```
