-- CreateTable
CREATE TABLE "ButtonLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ButtonLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ButtonLayoutTile" (
    "id" TEXT NOT NULL,
    "buttonLayoutId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "colSpan" INTEGER NOT NULL,
    "rowSpan" INTEGER NOT NULL,
    "tone" TEXT NOT NULL,

    CONSTRAINT "ButtonLayoutTile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ButtonLayout_userId_idx" ON "ButtonLayout"("userId");

-- CreateIndex
CREATE INDEX "ButtonLayout_createdAt_idx" ON "ButtonLayout"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ButtonLayoutTile_buttonLayoutId_position_key" ON "ButtonLayoutTile"("buttonLayoutId", "position");

-- CreateIndex
CREATE INDEX "ButtonLayoutTile_buttonLayoutId_idx" ON "ButtonLayoutTile"("buttonLayoutId");

-- AddForeignKey
ALTER TABLE "ButtonLayout" ADD CONSTRAINT "ButtonLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ButtonLayoutTile" ADD CONSTRAINT "ButtonLayoutTile_buttonLayoutId_fkey" FOREIGN KEY ("buttonLayoutId") REFERENCES "ButtonLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
