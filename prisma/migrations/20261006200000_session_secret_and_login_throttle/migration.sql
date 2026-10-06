-- AlterTable
ALTER TABLE "AppConfig" ADD COLUMN "sessionSecret" TEXT;

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

-- Closed to the Supabase Data API like every other table (see
-- 20261006180000_enable_rls; default privileges already exclude the API
-- roles, so no grant to revoke here).
ALTER TABLE "LoginThrottle" ENABLE ROW LEVEL SECURITY;
