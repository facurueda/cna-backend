-- CreateTable
CREATE TABLE "CompetitionReferee" (
    "competitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CompetitionReferee_pkey" PRIMARY KEY ("competitionId","userId")
);

-- CreateIndex
CREATE INDEX "CompetitionReferee_userId_idx" ON "CompetitionReferee"("userId");

-- AddForeignKey
ALTER TABLE "CompetitionReferee" ADD CONSTRAINT "CompetitionReferee_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionReferee" ADD CONSTRAINT "CompetitionReferee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
