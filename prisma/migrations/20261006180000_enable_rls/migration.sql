-- Close the Supabase Data API (PostgREST) to every table.
--
-- The app never uses the Data API: it connects as `postgres`, which has
-- BYPASSRLS, so none of this changes what the app can read or write. But
-- Supabase grants the API roles (anon, authenticated) full access to new
-- tables in `public` by default, and only Inspection had RLS turned on —
-- AppConfig (the dashboard PIN hash), Equipment, Photo and Supervisor were
-- readable and writable by anyone holding the project's anon key.

-- RLS on with no policies = no rows for the API roles.
ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inspection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Photo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supervisor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- And take the grants away, including for tables created later by this
-- role (future migrations), so a new table is never exposed by default.
-- The roles only exist on Supabase; local/staging Postgres has neither.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;
