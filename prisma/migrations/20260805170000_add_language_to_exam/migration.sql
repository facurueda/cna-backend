-- Adds Exam.language so a finished exam can be shown as ES/EN in history, without depending on
-- FinalExamCatalog.language (practice exams have no catalog to fall back on).

ALTER TABLE "Exam" ADD COLUMN "language" "Language" NOT NULL DEFAULT 'ES';
