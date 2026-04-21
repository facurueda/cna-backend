-- Drop old join table
DROP TABLE IF EXISTS "FinalExamCatalogCompetition";

-- Create new join table
CREATE TABLE "FinalExamCatalogGroup" (
    "finalExamCatalogId" UUID NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "FinalExamCatalogGroup_pkey" PRIMARY KEY ("finalExamCatalogId","groupId")
);

-- Index
CREATE INDEX "FinalExamCatalogGroup_groupId_idx" ON "FinalExamCatalogGroup"("groupId");

-- Foreign keys
ALTER TABLE "FinalExamCatalogGroup" ADD CONSTRAINT "FinalExamCatalogGroup_finalExamCatalogId_fkey"
    FOREIGN KEY ("finalExamCatalogId") REFERENCES "FinalExamCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinalExamCatalogGroup" ADD CONSTRAINT "FinalExamCatalogGroup_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
