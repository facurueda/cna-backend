-- Add column
ALTER TABLE "Question" ADD COLUMN "Order" INTEGER;

-- Backfill order by oldest createdAt first
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Question"
)
UPDATE "Question" q
SET "Order" = ranked.rn
FROM ranked
WHERE q."id" = ranked."id";

-- Enforce required column
ALTER TABLE "Question" ALTER COLUMN "Order" SET NOT NULL;
