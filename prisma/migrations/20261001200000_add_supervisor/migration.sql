-- CreateTable
CREATE TABLE "Supervisor" (
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supervisor_pkey" PRIMARY KEY ("name")
);

-- The two names that were hardcoded in src/lib/supervisors.ts before the
-- list moved here.
INSERT INTO "Supervisor" ("name") VALUES ('Bum Yoon Kim'), ('Derek Mackety');
