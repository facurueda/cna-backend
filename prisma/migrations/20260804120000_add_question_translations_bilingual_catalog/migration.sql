-- Enables gen_random_uuid(), used below to backfill QuestionTranslation ids.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('ES', 'EN');

-- Guard: Question.code is about to become UNIQUE (it is the stable key shared
-- across language variants of the same logical question). Fail loudly instead
-- of silently corrupting data if duplicates already exist.
DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT "code" FROM "Question" GROUP BY "code" HAVING count(*) > 1
  ) duplicates;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'Question.code has % duplicate value(s). Resolve duplicates before running this migration.', dup_count;
  END IF;
END $$;

-- AlterTable: Question.code becomes the unique, language-agnostic identity of a question
ALTER TABLE "Question" ADD CONSTRAINT "Question_code_key" UNIQUE ("code");

-- CreateTable
CREATE TABLE "QuestionTranslation" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "QuestionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionTranslation_questionId_language_key" ON "QuestionTranslation"("questionId", "language");

-- CreateIndex
CREATE INDEX "QuestionTranslation_questionId_idx" ON "QuestionTranslation"("questionId");

-- AddForeignKey
ALTER TABLE "QuestionTranslation" ADD CONSTRAINT "QuestionTranslation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing question becomes its own logical Question row plus
-- one Spanish QuestionTranslation carrying the text that used to live on Question.text.
INSERT INTO "QuestionTranslation" ("id", "questionId", "language", "text")
SELECT gen_random_uuid(), "id", 'ES', "text" FROM "Question";

-- AlterTable: Answer moves from hanging off Question directly to hanging off
-- the language-specific QuestionTranslation.
ALTER TABLE "Answer" ADD COLUMN "questionTranslationId" UUID;

UPDATE "Answer" a
SET "questionTranslationId" = qt."id"
FROM "QuestionTranslation" qt
WHERE qt."questionId" = a."questionId" AND qt."language" = 'ES';

ALTER TABLE "Answer" ALTER COLUMN "questionTranslationId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- AlterTable
ALTER TABLE "Answer" DROP COLUMN "questionId";

-- CreateIndex
CREATE INDEX "Answer_questionTranslationId_idx" ON "Answer"("questionTranslationId");

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionTranslationId_fkey" FOREIGN KEY ("questionTranslationId") REFERENCES "QuestionTranslation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: text now lives on QuestionTranslation, not on the logical Question
ALTER TABLE "Question" DROP COLUMN "text";
