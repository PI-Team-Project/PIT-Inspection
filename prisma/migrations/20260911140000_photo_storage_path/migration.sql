-- Photos move out of Postgres and into a private Supabase Storage bucket.
--
-- dataUri becomes nullable rather than being dropped: the pre-wipe backup
-- still holds 15 inline photos that must stay restorable, and submission
-- falls back to inline bytes if storage is ever unreachable, so an
-- inspection is never lost to a bucket outage. Exactly one of the two
-- columns is set per row; storagePath wins when both are.
--
-- Safe on this database: production currently holds 0 photos, so nothing
-- needs rewriting and no backfill is required.
ALTER TABLE "Photo" ADD COLUMN "storagePath" TEXT;
ALTER TABLE "Photo" ALTER COLUMN "dataUri" DROP NOT NULL;
