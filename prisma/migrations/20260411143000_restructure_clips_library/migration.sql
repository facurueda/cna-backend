CREATE TYPE "ClipVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

CREATE TABLE "ClipCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipCollection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClipCollection_name_key" ON "ClipCollection"("name");

ALTER TABLE "Clip"
ADD COLUMN "categoryId" TEXT,
ADD COLUMN "collectionId" TEXT,
ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "visibility" "ClipVisibility" NOT NULL DEFAULT 'PRIVATE';

INSERT INTO "ClipCollection" ("id", "name", "description", "createdAt", "updatedAt")
VALUES (
    'clip-collection-migrados',
    'Migrados',
    'Coleccion creada automaticamente durante la migracion de clips.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ClipCategory" ("id", "name")
VALUES ('clip-category-default', 'Sin categoria')
ON CONFLICT ("name") DO NOTHING;

UPDATE "Clip" AS c
SET "categoryId" = selected."categoryId"
FROM (
    SELECT DISTINCT ON ("clipId") "clipId", "categoryId"
    FROM "ClipCategoryOnClip"
    ORDER BY "clipId", "categoryId"
) AS selected
WHERE c."id" = selected."clipId";

UPDATE "Clip"
SET "categoryId" = 'clip-category-default'
WHERE "categoryId" IS NULL;

UPDATE "Clip"
SET "collectionId" = 'clip-collection-migrados'
WHERE "collectionId" IS NULL;

ALTER TABLE "Clip"
ALTER COLUMN "categoryId" SET NOT NULL,
ALTER COLUMN "collectionId" SET NOT NULL;

CREATE INDEX "Clip_collectionId_idx" ON "Clip"("collectionId");
CREATE INDEX "Clip_categoryId_idx" ON "Clip"("categoryId");
CREATE INDEX "Clip_visibility_createdAt_idx" ON "Clip"("visibility", "createdAt");
CREATE INDEX "Clip_publishedAt_idx" ON "Clip"("publishedAt");

ALTER TABLE "Clip"
ADD CONSTRAINT "Clip_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "ClipCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Clip"
ADD CONSTRAINT "Clip_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClipCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP TABLE "ClipCategoryOnClip";
DROP TABLE "ClipReferee";

ALTER TABLE "Clip"
DROP COLUMN "matchId",
DROP COLUMN "status";

DROP TYPE "ClipStatus";
