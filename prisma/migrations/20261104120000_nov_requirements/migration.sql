-- CreateEnum
CREATE TYPE "DriveMode" AS ENUM ('online', 'offline', 'hybrid');

-- CreateEnum
CREATE TYPE "RecordKind" AS ENUM ('certificate', 'internship', 'project');

-- CreateEnum
CREATE TYPE "FeedbackTarget" AS ENUM ('event', 'opportunity');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FileKind" ADD VALUE 'attachment';
ALTER TYPE "FileKind" ADD VALUE 'record';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "file_id" TEXT;

-- AlterTable
ALTER TABLE "notices" ADD COLUMN     "batches" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "departments" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "file_id" TEXT,
ADD COLUMN     "max_cgpa" DOUBLE PRECISION,
ADD COLUMN     "min_cgpa" DOUBLE PRECISION,
ADD COLUMN     "placed" BOOLEAN,
ADD COLUMN     "programme_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "drive_mode" "DriveMode",
ADD COLUMN     "hiring_from" TEXT,
ADD COLUMN     "hiring_to" TEXT,
ADD COLUMN     "logistics" TEXT,
ADD COLUMN     "venue" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "appeal_at" TIMESTAMP(3),
ADD COLUMN     "appeal_note" TEXT,
ADD COLUMN     "appeal_reason" TEXT,
ADD COLUMN     "apply_unlocked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "university_profile" ADD COLUMN     "site" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "student_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kind" "RecordKind" NOT NULL,
    "title" TEXT NOT NULL,
    "organisation" TEXT,
    "description" TEXT,
    "start_month" TEXT,
    "end_month" TEXT,
    "url" TEXT,
    "file_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_feedback" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "target" "FeedbackTarget" NOT NULL,
    "target_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_records_student_id_kind_idx" ON "student_records"("student_id", "kind");

-- CreateIndex
CREATE INDEX "student_feedback_target_target_id_idx" ON "student_feedback"("target", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_feedback_student_id_target_target_id_key" ON "student_feedback"("student_id", "target", "target_id");

-- AddForeignKey
ALTER TABLE "student_records" ADD CONSTRAINT "student_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_feedback" ADD CONSTRAINT "student_feedback_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

