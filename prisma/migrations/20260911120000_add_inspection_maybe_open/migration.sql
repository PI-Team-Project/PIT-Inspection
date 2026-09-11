-- A query accelerator for "which inspections still have something open".
-- Defaults to true so every existing row is treated as a candidate until
-- the backfill runs: correct but slow is a safe intermediate state, whereas
-- defaulting to false would hide open issues in the window between this
-- migration and the backfill.
ALTER TABLE "Inspection" ADD COLUMN "maybeOpen" BOOLEAN NOT NULL DEFAULT true;

-- Partial index: the dashboard only ever asks for the true rows, and in a
-- healthy fleet those are a tiny fraction of the table. A partial index
-- stays small no matter how many closed inspections accumulate.
CREATE INDEX "Inspection_maybeOpen_createdAt_idx"
  ON "Inspection" ("createdAt")
  WHERE "maybeOpen";
