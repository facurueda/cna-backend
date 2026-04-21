-- CreateEnum
CREATE TYPE "AppCredentialPlatform" AS ENUM ('ANDROID', 'WINDOWS');

-- CreateTable
CREATE TABLE "AppCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "AppCredentialPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppCredential_userId_idx" ON "AppCredential"("userId");

-- CreateIndex
CREATE INDEX "AppCredential_platform_idx" ON "AppCredential"("platform");

-- CreateIndex
CREATE INDEX "AppCredential_revokedAt_idx" ON "AppCredential"("revokedAt");

-- AddForeignKey
ALTER TABLE "AppCredential" ADD CONSTRAINT "AppCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
