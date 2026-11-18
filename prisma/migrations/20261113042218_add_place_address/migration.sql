-- AlterTable
ALTER TABLE "candidates" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "stops" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '';
