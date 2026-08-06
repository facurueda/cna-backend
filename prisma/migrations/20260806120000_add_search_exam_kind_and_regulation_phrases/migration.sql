-- New exam type: "búsqueda de reglamento" — the referee types free text (the specific answer,
-- e.g. "7.8 b") for a phrase from the rulebook instead of picking multiple-choice options.
-- Reuses FinalExamCatalog/Exam wholesale via a new "kind" discriminator (CATALOG vs SEARCH)
-- instead of a parallel model chain.
--
-- Phrases are authored inline while creating a SEARCH catalog (up to 20, no pool/category —
-- each phrase carries its own free-text answer), but still persisted in RegulationPhrase so they
-- can be reused/picked from in a future UI once there are many.

CREATE TYPE "FinalExamCatalogKind" AS ENUM ('CATALOG', 'SEARCH');

ALTER TABLE "FinalExamCatalog" ADD COLUMN "kind" "FinalExamCatalogKind" NOT NULL DEFAULT 'CATALOG';
ALTER TABLE "Exam" ADD COLUMN "catalogKind" "FinalExamCatalogKind" NOT NULL DEFAULT 'CATALOG';
ALTER TABLE "ExamQuestion" ADD COLUMN "submittedText" TEXT;

CREATE TABLE "RegulationPhrase" (
    "id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulationPhrase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinalExamCatalogPhrase" (
    "finalExamCatalogId" UUID NOT NULL,
    "regulationPhraseId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FinalExamCatalogPhrase_pkey" PRIMARY KEY ("finalExamCatalogId","regulationPhraseId")
);

CREATE INDEX "FinalExamCatalogPhrase_finalExamCatalogId_idx" ON "FinalExamCatalogPhrase"("finalExamCatalogId");

ALTER TABLE "FinalExamCatalogPhrase" ADD CONSTRAINT "FinalExamCatalogPhrase_finalExamCatalogId_fkey" FOREIGN KEY ("finalExamCatalogId") REFERENCES "FinalExamCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinalExamCatalogPhrase" ADD CONSTRAINT "FinalExamCatalogPhrase_regulationPhraseId_fkey" FOREIGN KEY ("regulationPhraseId") REFERENCES "RegulationPhrase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
