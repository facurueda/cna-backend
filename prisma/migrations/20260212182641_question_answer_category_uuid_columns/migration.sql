/*
  Warnings:

  - The primary key for the `Answer` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Category` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Question` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `categoryId` column on the `Question` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `id` on the `Answer` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `questionId` on the `Answer` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Category` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Question` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_categoryId_fkey";

-- AlterTable
ALTER TABLE "Answer" DROP CONSTRAINT "Answer_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "questionId",
ADD COLUMN     "questionId" UUID NOT NULL,
ADD CONSTRAINT "Answer_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Category" DROP CONSTRAINT "Category_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "Category_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Question" DROP CONSTRAINT "Question_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "categoryId",
ADD COLUMN     "categoryId" UUID,
ADD CONSTRAINT "Question_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
