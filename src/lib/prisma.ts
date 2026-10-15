import { PrismaClient } from "@/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  pgPool?: Pool
}

// Bounded, fail-fast pool. On serverless each warm instance keeps its own
// pool, so `max` is deliberately small — many instances × a large pool is how
// a 24/7 app exhausts the database's connection limit. `connectionTimeoutMillis`
// is the important one for reliability: if the database is briefly unreachable
// a request errors in ~10s (and the error boundary offers a retry) instead of
// hanging forever, which is what a missing timeout turns into a page that
// never finishes loading. Reused across hot reloads via globalThis so dev
// doesn't leak pools; the same reuse is harmless in production.
//
// Production's DATABASE_URL (set in Vercel) is Supabase's TRANSACTION pooler,
// port 6543: a connection goes back to the pool after each query, so overlapping
// instances during a deploy can't use up the pooler's 15 slots. The session
// pooler (5432) kept one slot per open connection and hit that limit right
// after deploys. Nothing here needs session state — no prepared-statement
// names, SET, LISTEN or advisory locks — so no `?pgbouncer=true` is needed.
//
// The local .env keeps the SESSION pooler (5432) on purpose: `prisma migrate`
// runs from this machine, never on Vercel, and needs session mode. Don't add a
// DIRECT_URL to prisma.config.ts for this — db:staging:migrate only overrides
// DATABASE_URL, so a DIRECT_URL from .env would send it to production.
const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  })
const adapter = new PrismaPg(pool)

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.pgPool = pool
}
