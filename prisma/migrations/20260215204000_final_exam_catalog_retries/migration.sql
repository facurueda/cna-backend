-- CreateEnum
CREATE TYPE "FinalExamCatalogStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- AlterTable
ALTER TABLE "Exam"
ADD COLUMN "finalExamCatalogId" UUID,
ADD COLUMN "attemptNumber" INTEGER;

-- CreateTable
CREATE TABLE "FinalExamCatalog" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "isTimed" BOOLEAN NOT NULL DEFAULT false,
    "totalTimeSeconds" INTEGER,
    "maxRetries" INTEGER NOT NULL DEFAULT 0,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT true,
    "passThresholdPercent" INTEGER NOT NULL DEFAULT 70,
    "status" "FinalExamCatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinalExamCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinalExamCatalogCategory" (
    "finalExamCatalogId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "FinalExamCatalogCategory_pkey" PRIMARY KEY ("finalExamCatalogId","categoryId")
);

-- CreateTable
CREATE TABLE "FinalExamCatalogCompetition" (
    "finalExamCatalogId" UUID NOT NULL,
    "competitionId" TEXT NOT NULL,

    CONSTRAINT "FinalExamCatalogCompetition_pkey" PRIMARY KEY ("finalExamCatalogId","competitionId")
);

-- CreateIndex
CREATE INDEX "Exam_finalExamCatalogId_idx" ON "Exam"("finalExamCatalogId");

-- CreateIndex
CREATE UNIQUE INDEX "Exam_userId_finalExamCatalogId_attemptNumber_key" ON "Exam"("userId", "finalExamCatalogId", "attemptNumber");

-- CreateIndex
CREATE INDEX "FinalExamCatalog_status_idx" ON "FinalExamCatalog"("status");

-- CreateIndex
CREATE INDEX "FinalExamCatalog_createdAt_idx" ON "FinalExamCatalog"("createdAt");

-- CreateIndex
CREATE INDEX "FinalExamCatalogCategory_categoryId_idx" ON "FinalExamCatalogCategory"("categoryId");

-- CreateIndex
CREATE INDEX "FinalExamCatalogCompetition_competitionId_idx" ON "FinalExamCatalogCompetition"("competitionId");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_finalExamCatalogId_fkey" FOREIGN KEY ("finalExamCatalogId") REFERENCES "FinalExamCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalExamCatalog" ADD CONSTRAINT "FinalExamCatalog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalExamCatalogCategory" ADD CONSTRAINT "FinalExamCatalogCategory_finalExamCatalogId_fkey" FOREIGN KEY ("finalExamCatalogId") REFERENCES "FinalExamCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalExamCatalogCategory" ADD CONSTRAINT "FinalExamCatalogCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalExamCatalogCompetition" ADD CONSTRAINT "FinalExamCatalogCompetition_finalExamCatalogId_fkey" FOREIGN KEY ("finalExamCatalogId") REFERENCES "FinalExamCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinalExamCatalogCompetition" ADD CONSTRAINT "FinalExamCatalogCompetition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
