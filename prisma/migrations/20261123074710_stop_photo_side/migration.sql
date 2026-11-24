-- CreateEnum
CREATE TYPE "PhotoSide" AS ENUM ('up', 'down', 'left', 'right');

-- AlterTable
ALTER TABLE "stops" ADD COLUMN     "photo_side" "PhotoSide" NOT NULL DEFAULT 'up';
