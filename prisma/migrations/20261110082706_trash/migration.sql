-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "deleted_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "trips_deleted_at_idx" ON "trips"("deleted_at");
