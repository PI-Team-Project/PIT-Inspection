import { createHash } from "crypto"
import { prisma } from "./prisma"

// Failed PIN attempts, counted in the database. The old counter lived in a
// cookie, so deleting the cookie reset it.
//
// Two limits:
// - per client (hashed IP): 5 failures in 15 minutes → locked 15 minutes
// - all clients together: 100 failures in an hour → logins locked for an hour
// The global limit is what stops a spread-out guess at a 6-digit PIN; it can
// be tripped on purpose, which only blocks NEW sign-ins (existing sessions
// keep working).

const CLIENT = { max: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 }
const GLOBAL = { max: 100, windowMs: 60 * 60_000, lockMs: 60 * 60_000 }
const GLOBAL_KEY = "global"

export function clientKey(ip: string): string {
  return "ip:" + createHash("sha256").update(`pit-login:${ip}`).digest("hex").slice(0, 32)
}

// Minutes until the first lock ends, or null when sign-in is allowed.
export async function loginLockedMinutes(key: string, now = new Date()): Promise<number | null> {
  const rows = await prisma.loginThrottle.findMany({ where: { key: { in: [key, GLOBAL_KEY] } } })
  const until = rows
    .map((r) => r.lockedUntil)
    .filter((d): d is Date => d !== null && d > now)
    .sort((a, b) => b.getTime() - a.getTime())[0]
  return until ? Math.ceil((until.getTime() - now.getTime()) / 60_000) : null
}

async function bump(key: string, limit: typeof CLIENT, now: Date): Promise<void> {
  const row = await prisma.loginThrottle.findUnique({ where: { key } })
  const fresh = !row || now.getTime() - row.windowStart.getTime() > limit.windowMs
  const failures = fresh ? 1 : row.failures + 1
  const lockedUntil = failures >= limit.max ? new Date(now.getTime() + limit.lockMs) : null
  const data = { failures: lockedUntil ? 0 : failures, windowStart: fresh || lockedUntil ? now : row.windowStart, lockedUntil }
  await prisma.loginThrottle.upsert({ where: { key }, create: { key, ...data }, update: data })
}

export async function recordLoginFailure(key: string, now = new Date()): Promise<void> {
  await bump(key, CLIENT, now)
  await bump(GLOBAL_KEY, GLOBAL, now)
}

export async function clearLoginFailures(key: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { key } })
}
