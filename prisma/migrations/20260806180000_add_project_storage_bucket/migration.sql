-- Bucket de R2 por proyecto. Nullable a proposito: los proyectos existentes siguen
-- usando el bucket por defecto (R2_BUCKET_VIDEOS) y no hay que mover ningun objeto.
-- Los proyectos nuevos nacen con bucket dedicado.
ALTER TABLE "Project" ADD COLUMN "storageBucket" TEXT;
