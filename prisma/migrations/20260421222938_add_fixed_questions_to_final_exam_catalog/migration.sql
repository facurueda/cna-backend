-- CreateTable
CREATE TABLE "FinalExamCatalogQuestion" (
    "finalExamCatalogId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FinalExamCatalogQuestion_pkey" PRIMARY KEY ("finalExamCatalogId","questionId")
);

-- CreateIndex
CREATE INDEX "FinalExamCatalogQuestion_finalExamCatalogId_idx" ON "FinalExamCatalogQuestion"("finalExamCatalogId");

-- AddForeignKey
ALTER TABLE "FinalExamCatalogQuestion" ADD CONSTRAINT "FinalExamCatalogQuestion_finalExamCatalogId_fkey" FOREIGN KEY ("finalExamCatalogId") REFERENCES "FinalExamCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalExamCatalogQuestion" ADD CONSTRAINT "FinalExamCatalogQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
