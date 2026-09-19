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
