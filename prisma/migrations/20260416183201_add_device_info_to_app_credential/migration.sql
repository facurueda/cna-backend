-- AlterEnum
ALTER TYPE "AppCredentialPlatform" ADD VALUE 'IOS';

-- AlterTable
ALTER TABLE "AppCredential" ALTER COLUMN "scopes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Clip" ALTER COLUMN "description" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AppCredentialDevice" (
    "id" TEXT NOT NULL,
    "appCredentialId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "os" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "buildVersion" TEXT,
    "timezone" TEXT,
    "locale" TEXT,
    "isPhysicalDevice" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppCredentialDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppCredentialDevice_appCredentialId_key" ON "AppCredentialDevice"("appCredentialId");

-- CreateIndex
CREATE INDEX "AppCredentialDevice_deviceId_idx" ON "AppCredentialDevice"("deviceId");

-- AddForeignKey
ALTER TABLE "AppCredentialDevice" ADD CONSTRAINT "AppCredentialDevice_appCredentialId_fkey" FOREIGN KEY ("appCredentialId") REFERENCES "AppCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
