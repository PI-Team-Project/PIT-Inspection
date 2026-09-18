import { createHash, timingSafeEqual } from "crypto"
import { prisma } from "./prisma"

// The manager PIN used to be a build-time env var only. It now lives in the
// database (as a hash) so a manager can change it from the dashboard without
// a redeploy — see the AppConfig model and changeDashboardPin.
//
// IMPORTANT: this changes only what LOGIN is checked against. The session
// cookie is still derived from the DASHBOARD_PIN env var (dashboardSessionValue
// in auth.ts), which is deliberately left untouched: changing the PIN here
// does not rotate live sessions, and — crucially — this file is only read at
// login and at a PIN change, never on every request, so per-request auth stays
// stateless and adds no database dependency.

const CONFIG_ID = "singleton"

export function hashPin(pin: string): string {
  return createHash("sha256").update(`pit-pin:${pin}`).digest("hex")
}

// The hash a submitted PIN is checked against: the stored one if a manager
// has ever set it, otherwise the DASHBOARD_PIN env var (the bootstrap value).
// Any database problem (including the table not existing yet) falls back to
// the env PIN rather than locking everyone out — so this code is safe to
// ship before its migration has run against a given environment.
export async function getEffectivePinHash(): Promise<string> {
  try {
    const cfg = await prisma.appConfig.findUnique({ where: { id: CONFIG_ID } })
    if (cfg?.dashboardPinHash) return cfg.dashboardPinHash
  } catch {
    // fall through to the env PIN
  }
  return hashPin(process.env.DASHBOARD_PIN ?? "")
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!pin) return false
  const a = Buffer.from(hashPin(pin), "hex")
  const b = Buffer.from(await getEffectivePinHash(), "hex")
  // Both are fixed-length SHA-256 digests, so lengths always match; the guard
  // is only here so timingSafeEqual never throws on a malformed stored value.
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function setDashboardPin(pin: string): Promise<void> {
  const dashboardPinHash = hashPin(pin)
  await prisma.appConfig.upsert({
    where: { id: CONFIG_ID },
    create: { id: CONFIG_ID, dashboardPinHash },
    update: { dashboardPinHash },
  })
}
