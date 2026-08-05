-- Lets an admin pair up referees within a FinalExamCatalog so they take the exam together
-- from one device (result gets duplicated to both Exam rows at finish time, handled in app code).
-- Scoped to a single catalog on purpose: pairs are not meant to be reused across exams.

CREATE TABLE "FinalExamCatalogPair" (
    "id" UUID NOT NULL,
    "finalExamCatalogId" UUID NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,

    CONSTRAINT "FinalExamCatalogPair_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinalExamCatalogPair_finalExamCatalogId_userAId_key" ON "FinalExamCatalogPair"("finalExamCatalogId", "userAId");
CREATE UNIQUE INDEX "FinalExamCatalogPair_finalExamCatalogId_userBId_key" ON "FinalExamCatalogPair"("finalExamCatalogId", "userBId");
CREATE INDEX "FinalExamCatalogPair_finalExamCatalogId_idx" ON "FinalExamCatalogPair"("finalExamCatalogId");

ALTER TABLE "FinalExamCatalogPair" ADD CONSTRAINT "FinalExamCatalogPair_finalExamCatalogId_fkey" FOREIGN KEY ("finalExamCatalogId") REFERENCES "FinalExamCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinalExamCatalogPair" ADD CONSTRAINT "FinalExamCatalogPair_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinalExamCatalogPair" ADD CONSTRAINT "FinalExamCatalogPair_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
