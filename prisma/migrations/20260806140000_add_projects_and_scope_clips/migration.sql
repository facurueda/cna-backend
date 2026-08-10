-- Multi-proyecto: introduce Project/ProjectMember y hace tenant-scoped el modulo de clips.
-- La migracion es backfill-safe: crea el proyecto por defecto a partir de DEFAULT_PROJECT_SLUG
-- (o 'cna') y reasigna todos los datos existentes a el, sin perder filas.

-- 1. Nuevos tipos
CREATE TYPE "ClipStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'READY', 'ERROR');

-- 2. Project / ProjectMember
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

CREATE TABLE "ProjectMember" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId", "userId")
);

CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Proyecto por defecto + afiliacion de todos los usuarios actuales.
--    El rol de la membresia hereda el rol global que el usuario ya tenia.
INSERT INTO "Project" ("id", "slug", "name", "updatedAt")
VALUES ('prj_default_0000000000000000', 'cna', 'CNA', CURRENT_TIMESTAMP);

INSERT INTO "ProjectMember" ("projectId", "userId", "role")
SELECT 'prj_default_0000000000000000', "id", "role" FROM "User";

-- 4. ClipCategory: scoped por proyecto
ALTER TABLE "ClipCategory" ADD COLUMN "projectId" TEXT;
UPDATE "ClipCategory" SET "projectId" = 'prj_default_0000000000000000';
ALTER TABLE "ClipCategory" ALTER COLUMN "projectId" SET NOT NULL;

DROP INDEX IF EXISTS "ClipCategory_name_key";
CREATE UNIQUE INDEX "ClipCategory_projectId_name_key" ON "ClipCategory"("projectId", "name");
CREATE INDEX "ClipCategory_projectId_idx" ON "ClipCategory"("projectId");

ALTER TABLE "ClipCategory" ADD CONSTRAINT "ClipCategory_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. ClipCollection: scoped por proyecto
ALTER TABLE "ClipCollection" ADD COLUMN "projectId" TEXT;
UPDATE "ClipCollection" SET "projectId" = 'prj_default_0000000000000000';
ALTER TABLE "ClipCollection" ALTER COLUMN "projectId" SET NOT NULL;

DROP INDEX IF EXISTS "ClipCollection_name_key";
CREATE UNIQUE INDEX "ClipCollection_projectId_name_key" ON "ClipCollection"("projectId", "name");
CREATE INDEX "ClipCollection_projectId_idx" ON "ClipCollection"("projectId");

ALTER TABLE "ClipCollection" ADD CONSTRAINT "ClipCollection_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Clip: proyecto, coleccion opcional, storage por key y estado de procesamiento.
ALTER TABLE "Clip" ADD COLUMN "projectId" TEXT;
UPDATE "Clip" SET "projectId" = 'prj_default_0000000000000000';
ALTER TABLE "Clip" ALTER COLUMN "projectId" SET NOT NULL;

ALTER TABLE "Clip" ADD CONSTRAINT "Clip_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La coleccion pasa a ser opcional: un clip puede vivir suelto en la galeria.
ALTER TABLE "Clip" ALTER COLUMN "collectionId" DROP NOT NULL;
ALTER TABLE "Clip" DROP CONSTRAINT IF EXISTS "Clip_collectionId_fkey";
ALTER TABLE "Clip" ADD CONSTRAINT "Clip_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "ClipCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- description deja de ser obligatoria en la practica: default vacio.
ALTER TABLE "Clip" ALTER COLUMN "description" SET DEFAULT '';

-- Storage por key + estado.
ALTER TABLE "Clip" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "Clip" ADD COLUMN "videoKey" TEXT;
ALTER TABLE "Clip" ADD COLUMN "thumbnailKey" TEXT;
ALTER TABLE "Clip" ADD COLUMN "sizeBytes" INTEGER;
ALTER TABLE "Clip" ADD COLUMN "status" "ClipStatus" NOT NULL DEFAULT 'UPLOADING';
ALTER TABLE "Clip" ADD COLUMN "statusError" TEXT;

-- Se conservan las URLs viejas como legacy en vez de descartarlas.
ALTER TABLE "Clip" RENAME COLUMN "videoUrl" TO "legacyVideoUrl";
ALTER TABLE "Clip" RENAME COLUMN "thumbnailUrl" TO "legacyThumbnailUrl";
ALTER TABLE "Clip" ALTER COLUMN "legacyVideoUrl" DROP NOT NULL;

-- Los clips preexistentes ya tienen su archivo servible: se marcan como READY.
UPDATE "Clip" SET "status" = 'READY' WHERE "legacyVideoUrl" IS NOT NULL;

-- 7. Indices de Clip por proyecto
DROP INDEX IF EXISTS "Clip_visibility_createdAt_idx";
DROP INDEX IF EXISTS "Clip_createdAt_idx";
CREATE INDEX "Clip_projectId_visibility_createdAt_idx" ON "Clip"("projectId", "visibility", "createdAt");
CREATE INDEX "Clip_projectId_createdAt_idx" ON "Clip"("projectId", "createdAt");
CREATE INDEX "Clip_status_idx" ON "Clip"("status");
