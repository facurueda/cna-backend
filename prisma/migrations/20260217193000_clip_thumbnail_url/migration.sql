-- Add optional thumbnail URL to clips
ALTER TABLE "Clip"
ADD COLUMN "thumbnailUrl" TEXT;
