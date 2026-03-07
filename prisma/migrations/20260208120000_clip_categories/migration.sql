-- CreateTable
CREATE TABLE "ClipCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ClipCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipCategoryOnClip" (
    "clipId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "ClipCategoryOnClip_pkey" PRIMARY KEY ("clipId","categoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClipCategory_name_key" ON "ClipCategory"("name");

-- CreateIndex
CREATE INDEX "ClipCategoryOnClip_categoryId_idx" ON "ClipCategoryOnClip"("categoryId");

-- AddForeignKey
ALTER TABLE "ClipCategoryOnClip" ADD CONSTRAINT "ClipCategoryOnClip_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipCategoryOnClip" ADD CONSTRAINT "ClipCategoryOnClip_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ClipCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
