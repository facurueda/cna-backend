ALTER TABLE "ExamQuestionOption"
ADD COLUMN "position" INTEGER;

WITH ranked_options AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "examQuestionId"
      ORDER BY "key" ASC, "id" ASC
    ) AS "position"
  FROM "ExamQuestionOption"
)
UPDATE "ExamQuestionOption" AS option
SET "position" = ranked_options."position"
FROM ranked_options
WHERE option."id" = ranked_options."id";

ALTER TABLE "ExamQuestionOption"
ALTER COLUMN "position" SET NOT NULL;

CREATE INDEX "ExamQuestionOption_examQuestionId_position_idx"
ON "ExamQuestionOption"("examQuestionId", "position");
