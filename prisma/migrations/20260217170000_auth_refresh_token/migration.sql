-- Add hashed refresh token storage for JWT rotation
ALTER TABLE "User"
ADD COLUMN "refreshTokenHash" TEXT;
