-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "trip_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StopKind" NOT NULL DEFAULT 'other',
    "description" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "place_provider" "MapProvider",
    "place_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidates_trip_id_created_at_idx" ON "candidates"("trip_id", "created_at");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraints (손으로 넣음)
-- 후보: 좌표는 위경도 범위 안(장소와 같다).
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
