-- CreateTable
CREATE TABLE "eventos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_items" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "endTime" TEXT NOT NULL,
    "endTimeMs" INTEGER NOT NULL,
    "eventTimeMs" INTEGER NOT NULL,
    "incrementId" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "startTimeMs" INTEGER NOT NULL,
    "tileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "evento_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_userId_idx" ON "eventos"("userId");

-- CreateIndex
CREATE INDEX "eventos_createdAt_idx" ON "eventos"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "evento_items_eventId_position_key" ON "evento_items"("eventId", "position");

-- CreateIndex
CREATE INDEX "evento_items_eventId_idx" ON "evento_items"("eventId");

-- CreateIndex
CREATE INDEX "evento_items_tileId_idx" ON "evento_items"("tileId");

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_items" ADD CONSTRAINT "evento_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
