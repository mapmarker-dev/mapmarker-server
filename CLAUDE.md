@../.github/CLAUDE.md

# mapmarker-server

MapMarker의 API 서버. NestJS 12 + Prisma 7 + PostgreSQL 18, Node 24, 패키지 매니저는 npm. 소스는 `src/`, e2e 테스트는 `test/`. 원격 저장소는 `mapmarker-dev/mapmarker-server`.

## 명령어

- 의존성 설치: `npm install` (Prisma Client도 이때 `src/generated/prisma/`에 만든다)
- 로컬 DB 켜기·끄기: `npm run db:up` / `npm run db:down` (Docker Compose)
- 마이그레이션 만들기·적용: `npm run db:migrate` (`prisma migrate dev`)
- 실행: `npm run start:dev` → API `http://localhost:3000`, Swagger `http://localhost:3000/docs`
- 빌드: `npm run build`
- 단위 테스트: `npm test`
- e2e 테스트: `npm run test:e2e` (DB가 켜져 있어야 한다)
- lint: `npm run lint` (oxlint), 형식 확인: `npm run format:check` (Prettier)

## 환경 변수

- 값은 `.env`에 둔다. `.env`는 커밋하지 않고, 항목 목록은 `.env.example`에 둔다. 새 변수를 추가하면 `.env.example`과 `src/config/env.ts`의 `Env`도 함께 고친다.
- 서버 코드는 `ConfigService<Env, true>`로만 값을 읽는다. `process.env`를 직접 읽지 않는다. 시작할 때 `Env`로 검사해서, 빠지거나 틀리면 서버가 뜨지 않는다.
- Prisma CLI는 `prisma.config.ts`가 `.env`의 `DATABASE_URL`을 읽는다.
- e2e는 `TEST_DATABASE_URL`의 DB를 매번 지우고 다시 만든다. DB 이름은 `_test`로 끝나야 한다.

## 브랜치

이 저장소는 브랜치를 아래 4개만 운영한다. 다른 브랜치를 새로 만들지 않는다.

- `main`: 기본 브랜치
- `dev`: 개발할 때
- `test`: 기술 검증 같은 테스트가 필요할 때
- `wip/<브랜치>` : 공통 규칙의 인수인계용 임시 브랜치

## 폴더 구조

```
prisma/
├─ schema.prisma       DB 스키마
└─ migrations/         마이그레이션 SQL (커밋한다)
prisma.config.ts       Prisma CLI 설정
docker-compose.yml     로컬 PostgreSQL (개발 DB와 e2e 테스트 DB)
src/
├─ main.ts             부트스트랩 → configureApp → listen
├─ app.module.ts       전역 모듈(Config, Prisma)과 기능 모듈
├─ app.setup.ts        configureApp: ValidationPipe, URI 버전(/v1), Swagger
├─ config/             환경 변수 검사(Env)
├─ prisma/             PrismaModule(전역), PrismaService
├─ generated/prisma/   Prisma Client 생성물 (커밋하지 않음)
└─ <기능>/             기능 모듈. 예: health, (다음) auth, trips, photos
test/
├─ *.e2e-spec.ts       e2e 테스트
└─ setup/              테스트 DB 준비(global-setup), 테스트용 환경 변수
```

- 기능 폴더는 `xxx.module.ts`, `xxx.controller.ts`, `xxx.service.ts`, `dto/`로 시작하고, 단위 테스트(`*.spec.ts`)는 같은 폴더에 둔다.
- 컨트롤러는 요청·응답만 다루고, 규칙과 DB 접근은 서비스에 둔다.
- 기능끼리 같이 쓸 코드는 `common/`(필요해지면 만든다)으로 옮긴다.

## API 규칙

- 경로는 `/v1/...`이다(`app.setup.ts`의 URI 버전). 깔린 앱은 바로 업데이트되지 않으므로, 깨지는 변경은 새 버전으로 낸다. `/health`처럼 버전과 상관없는 경로는 `VERSION_NEUTRAL`로 둔다.
- 요청 본문은 DTO 클래스(class-validator)로 검사한다. DTO에 없는 필드는 400으로 거절한다.
- Swagger에 보이도록 DTO에 `@ApiProperty`, 컨트롤러에 응답 데코레이터를 단다. production(`NODE_ENV`)에서는 Swagger를 열지 않는다.
- JSON 필드 이름은 앱 모델(`../mapmarker-app/lib/data/models/`)과 같은 camelCase로 맞춘다.

## Prisma

- 버전은 7.10.x로 고정한다. npm의 `latest` 태그가 8.0 RC를 가리키고 있어서, 올릴 때는 버전을 직접 정해 `prisma`와 `@prisma/client`, `@prisma/adapter-pg`를 함께 올린다.
- 스키마를 바꾸면 `npm run db:migrate -- --name <이름>`으로 마이그레이션을 만들고, 만든 SQL을 확인해 함께 커밋한다. 적용된 마이그레이션 파일은 고치지 않는다.
- DB 연결은 드라이버 어댑터(`@prisma/adapter-pg`)로 한다(`PrismaService`).

## 코딩 규칙

- 커밋 전에 `npm run lint`, `npm run format:check`, `npm test`, `npm run test:e2e`가 통과하는지 확인한다.
- 테스트 이름과 주석은 한국어로 쓴다(앱 저장소와 같음).
