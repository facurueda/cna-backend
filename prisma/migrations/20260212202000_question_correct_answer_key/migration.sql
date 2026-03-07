-- CreateTable
CREATE TABLE "QuestionCorrectAnswerKey" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "QuestionCorrectAnswerKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionCorrectAnswerKey_questionId_idx" ON "QuestionCorrectAnswerKey"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionCorrectAnswerKey_questionId_key_key" ON "QuestionCorrectAnswerKey"("questionId", "key");

-- AddForeignKey
ALTER TABLE "QuestionCorrectAnswerKey" ADD CONSTRAINT "QuestionCorrectAnswerKey_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
