-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('PENDING', 'FINISHED');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('FINAL', 'PRACTICE');

-- CreateTable
CREATE TABLE "Exam" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "isTimed" BOOLEAN NOT NULL DEFAULT false,
    "totalTimeSeconds" INTEGER,
    "status" "ExamStatus" NOT NULL DEFAULT 'PENDING',
    "examType" "ExamType" NOT NULL,
    "passThresholdPercent" INTEGER NOT NULL DEFAULT 70,
    "correctCount" INTEGER,
    "wrongCount" INTEGER,
    "scorePercent" DOUBLE PRECISION,
    "isPassed" BOOLEAN,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestion" (
    "id" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "questionCode" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "categoryName" TEXT,

    CONSTRAINT "ExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestionOption" (
    "id" UUID NOT NULL,
    "examQuestionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ExamQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestionCorrectKey" (
    "id" UUID NOT NULL,
    "examQuestionId" UUID NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "ExamQuestionCorrectKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamQuestionResponse" (
    "id" UUID NOT NULL,
    "examQuestionId" UUID NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "ExamQuestionResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exam_userId_idx" ON "Exam"("userId");

-- CreateIndex
CREATE INDEX "Exam_status_idx" ON "Exam"("status");

-- CreateIndex
CREATE INDEX "Exam_createdAt_idx" ON "Exam"("createdAt");

-- CreateIndex
CREATE INDEX "ExamQuestion_examId_idx" ON "ExamQuestion"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestion_examId_position_key" ON "ExamQuestion"("examId", "position");

-- CreateIndex
CREATE INDEX "ExamQuestionOption_examQuestionId_idx" ON "ExamQuestionOption"("examQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestionOption_examQuestionId_key_key" ON "ExamQuestionOption"("examQuestionId", "key");

-- CreateIndex
CREATE INDEX "ExamQuestionCorrectKey_examQuestionId_idx" ON "ExamQuestionCorrectKey"("examQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestionCorrectKey_examQuestionId_key_key" ON "ExamQuestionCorrectKey"("examQuestionId", "key");

-- CreateIndex
CREATE INDEX "ExamQuestionResponse_examQuestionId_idx" ON "ExamQuestionResponse"("examQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestionResponse_examQuestionId_key_key" ON "ExamQuestionResponse"("examQuestionId", "key");

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestionOption" ADD CONSTRAINT "ExamQuestionOption_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestionCorrectKey" ADD CONSTRAINT "ExamQuestionCorrectKey_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamQuestionResponse" ADD CONSTRAINT "ExamQuestionResponse_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
