-- CreateEnum
CREATE TYPE "TripPhase" AS ENUM ('before', 'during', 'after');

-- CreateEnum
CREATE TYPE "Season" AS ENUM ('spring', 'summer', 'autumn', 'winter');

-- CreateEnum
CREATE TYPE "TripOrigin" AS ENUM ('manual', 'ai', 'copy');

-- CreateEnum
CREATE TYPE "MapProvider" AS ENUM ('naver', 'google');

-- CreateEnum
CREATE TYPE "StopKind" AS ENUM ('lodging', 'food', 'tour', 'other');

-- CreateEnum
CREATE TYPE "SegmentType" AS ENUM ('normal', 'gps_track');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "nights" INTEGER NOT NULL,
    "season" "Season" NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "phase_override" "TripPhase",
    "map_provider" "MapProvider",
    "origin" "TripOrigin" NOT NULL DEFAULT 'manual',
    "copied_from_trip_id" UUID,
    "share_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stops" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StopKind" NOT NULL DEFAULT 'other',
    "description" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "planned_time" TIME(0),
    "visited" BOOLEAN NOT NULL DEFAULT false,
    "visited_at" TIMESTAMPTZ(3),
    "time_zone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
    "place_provider" "MapProvider",
    "place_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "from_stop_id" UUID NOT NULL,
    "to_stop_id" UUID NOT NULL,
    "legs" JSONB NOT NULL DEFAULT '[]',
    "curvature" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" "SegmentType" NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trips_share_id_key" ON "trips"("share_id");

-- CreateIndex
CREATE INDEX "trips_user_id_updated_at_idx" ON "trips"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "trips_copied_from_trip_id_idx" ON "trips"("copied_from_trip_id");

-- AddUniqueConstraint (손으로 고침)
-- Prisma가 만든 UNIQUE INDEX 대신 미룰 수 있는 유일 제약으로 둔다. 이름은 Prisma 스키마의 @@unique(map:)와 같다.
-- 끼워 넣기·끌기처럼 여러 장소의 순서를 한 트랜잭션에서 한꺼번에 밀어도, 커밋할 때만 겹치는지 검사한다.
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_id_day_sort_order_key" UNIQUE ("trip_id", "day", "sort_order") DEFERRABLE INITIALLY DEFERRED;

-- CreateIndex
CREATE UNIQUE INDEX "segments_from_stop_id_key" ON "segments"("from_stop_id");

-- CreateIndex
CREATE UNIQUE INDEX "segments_to_stop_id_key" ON "segments"("to_stop_id");

-- CreateIndex
CREATE INDEX "segments_trip_id_idx" ON "segments"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX "photos_storage_key_key" ON "photos"("storage_key");

-- CreateIndex
CREATE INDEX "photos_stop_id_idx" ON "photos"("stop_id");

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_copied_from_trip_id_fkey" FOREIGN KEY ("copied_from_trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stops" ADD CONSTRAINT "stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_from_stop_id_fkey" FOREIGN KEY ("from_stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_to_stop_id_fkey" FOREIGN KEY ("to_stop_id") REFERENCES "stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraints (손으로 넣음)
-- Prisma 스키마로는 표현할 수 없는 값 규칙이다. 앱 모델의 assert와 같은 규칙을 DB도 지킨다.

-- 여행: 박 수는 0 이상, 기간은 둘 다 있거나 둘 다 없고, 기간이 있으면 박 수 = 종료일 - 시작일.
ALTER TABLE "trips" ADD CONSTRAINT "trips_nights_check" CHECK ("nights" >= 0);
ALTER TABLE "trips" ADD CONSTRAINT "trips_dates_both_or_none_check" CHECK (("start_date" IS NULL) = ("end_date" IS NULL));
ALTER TABLE "trips" ADD CONSTRAINT "trips_dates_order_check" CHECK ("end_date" >= "start_date");
ALTER TABLE "trips" ADD CONSTRAINT "trips_nights_match_dates_check" CHECK ("start_date" IS NULL OR "nights" = "end_date" - "start_date");

-- 장소: 일차는 1부터, 순서는 0부터, 좌표는 위경도 범위 안.
ALTER TABLE "stops" ADD CONSTRAINT "stops_day_check" CHECK ("day" >= 1);
ALTER TABLE "stops" ADD CONSTRAINT "stops_sort_order_check" CHECK ("sort_order" >= 0);
ALTER TABLE "stops" ADD CONSTRAINT "stops_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "stops" ADD CONSTRAINT "stops_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);

-- 구간: 양 끝은 다른 장소, 곡률은 -1~1, 이동 수단 목록은 배열(안의 모양은 API의 DTO가 검사한다).
ALTER TABLE "segments" ADD CONSTRAINT "segments_distinct_stops_check" CHECK ("from_stop_id" <> "to_stop_id");
ALTER TABLE "segments" ADD CONSTRAINT "segments_curvature_check" CHECK ("curvature" BETWEEN -1 AND 1);
ALTER TABLE "segments" ADD CONSTRAINT "segments_legs_array_check" CHECK (jsonb_typeof("legs") = 'array');
