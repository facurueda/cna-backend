-- Grupos con acceso a una coleccion de clips.
--
-- Aditiva a proposito: no se inserta ninguna fila, asi que todas las colecciones
-- que ya existen quedan "sin grupos" = visibles para todos los arbitros, igual
-- que antes. No hay backfill ni cambio de comportamiento al aplicarla.
CREATE TABLE "ClipCollectionGroup" (
    "collectionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "ClipCollectionGroup_pkey" PRIMARY KEY ("collectionId","groupId")
);

CREATE INDEX "ClipCollectionGroup_groupId_idx" ON "ClipCollectionGroup"("groupId");

ALTER TABLE "ClipCollectionGroup"
    ADD CONSTRAINT "ClipCollectionGroup_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "ClipCollection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClipCollectionGroup"
    ADD CONSTRAINT "ClipCollectionGroup_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "Group"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
