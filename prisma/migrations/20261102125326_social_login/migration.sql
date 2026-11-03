-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('kakao', 'naver');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nickname" TEXT;

-- CreateTable
CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "SocialProvider" NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_provider_provider_user_id_key" ON "social_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_accounts_user_id_provider_key" ON "social_accounts"("user_id", "provider");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraints (손으로 넣음)
-- Prisma 스키마로는 표현할 수 없는 값 규칙이다.

-- 사용자: 닉네임은 30자 이하(없어도 된다).
ALTER TABLE "users" ADD CONSTRAINT "users_nickname_length_check" CHECK (char_length("nickname") <= 30);

-- 소셜 계정: 제공자 사용자 ID는 비어 있을 수 없다.
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_provider_user_id_check" CHECK ("provider_user_id" <> '');

-- 로그인 세션: 토큰 해시는 SHA-256(32바이트)이다.
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_token_hash_length_check" CHECK (octet_length("token_hash") = 32);
