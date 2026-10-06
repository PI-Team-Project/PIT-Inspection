import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { prisma } from "./prisma"

// The manager PIN lives in the database (AppConfig.dashboardPinHash) so a
// manager can change it from the dashboard without a redeploy. Until one is
// set, the DASHBOARD_PIN env var is the bootstrap PIN.
//
// Stored as "scrypt$<salt>$<hash>". A 6-digit PIN has only a million
// values, so the hash must be slow and salted: the old unsalted SHA-256
// ("pit-pin:" prefix, still accepted below) reversed in under a second.

const CONFIG_ID = "singleton"
const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function legacyHash(pin: string): string {
  return createHash("sha256").update(`pit-pin:${pin}`).digest("hex")
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")): string {
  const hash = scryptSync(pin, salt, 32, SCRYPT_PARAMS).toString("hex")
  return `scrypt$${salt}$${hash}`
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex")
  const y = Buffer.from(b, "hex")
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

export function pinMatches(pin: string, stored: string): boolean {
  if (!pin || !stored) return false
  if (stored.startsWith("scrypt$")) {
    const [, salt, hash] = stored.split("$")
    if (!salt || !hash) return false
    return safeEqualHex(hashPin(pin, salt).split("$")[2], hash)
  }
  return safeEqualHex(legacyHash(pin), stored)
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!pin) return false
  let stored: string | null | undefined
  try {
    stored = (await prisma.appConfig.findUnique({ where: { id: CONFIG_ID } }))?.dashboardPinHash
  } catch {
    stored = null
  }
  if (stored) return pinMatches(pin, stored)
  const envPin = process.env.DASHBOARD_PIN ?? ""
  return envPin.length > 0 && pin === envPin
}

// Changing the PIN also replaces the session secret, so everyone signed in
// with the old PIN is signed out.
export async function setDashboardPin(pin: string): Promise<void> {
  const data = { dashboardPinHash: hashPin(pin), sessionSecret: randomBytes(32).toString("hex") }
  await prisma.appConfig.upsert({ where: { id: CONFIG_ID }, create: { id: CONFIG_ID, ...data }, update: data })
  cachedSecret = null
}

// Read on every authenticated request, so cached per server instance. Each
// instance (and each route bundle) has its own copy: after a PIN change an
// old session can still pass on an instance whose copy is up to
// SECRET_CACHE_MS old. A NEW session is never refused because of a stale
// copy — hasDashboardSession re-reads the secret before rejecting.
const SECRET_CACHE_MS = 15_000
let cachedSecret: { value: string; at: number } | null = null

export async function getSessionSecret({ fresh = false }: { fresh?: boolean } = {}): Promise<string> {
  if (!fresh && cachedSecret && Date.now() - cachedSecret.at < SECRET_CACHE_MS) return cachedSecret.value
  const cfg = await prisma.appConfig.findUnique({ where: { id: CONFIG_ID } })
  let value = cfg?.sessionSecret
  if (!value) {
    // First use: create it without overwriting one another instance may
    // have created a moment ago.
    const fresh = randomBytes(32).toString("hex")
    await prisma.appConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, sessionSecret: fresh },
      update: {},
    })
    await prisma.appConfig.updateMany({ where: { id: CONFIG_ID, sessionSecret: null }, data: { sessionSecret: fresh } })
    value = (await prisma.appConfig.findUnique({ where: { id: CONFIG_ID } }))?.sessionSecret ?? fresh
  }
  cachedSecret = { value, at: Date.now() }
  return value
}
