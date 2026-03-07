-- CreateTable
CREATE TABLE "UserStats" (
    "userId" TEXT NOT NULL,
    "practiceTestsCount" INTEGER NOT NULL DEFAULT 0,
    "practiceAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalTestsPassedCount" INTEGER NOT NULL DEFAULT 0,
    "finalTestsTotalCount" INTEGER NOT NULL DEFAULT 0,
    "finalAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clipsCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStats_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "UserStats_practiceAverage_idx" ON "UserStats"("practiceAverage");

-- CreateIndex
CREATE INDEX "UserStats_finalAverage_idx" ON "UserStats"("finalAverage");

-- AddForeignKey
ALTER TABLE "UserStats" ADD CONSTRAINT "UserStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
