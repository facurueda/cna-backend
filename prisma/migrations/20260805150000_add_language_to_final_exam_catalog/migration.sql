-- Fixes a gap left by migration 20260804120000_add_question_translations_bilingual_catalog:
-- schema.prisma declares FinalExamCatalog.language, but the earlier migration never added the
-- column to the database, causing P2022 ("column language does not exist") on every
-- finalExamCatalog.create() call.

ALTER TABLE "FinalExamCatalog" ADD COLUMN "language" "Language" NOT NULL DEFAULT 'ES';
