import { createHmac, timingSafeEqual } from "crypto"

// Dashboard session cookie: "<expiresAtMs>.<hmac>". The HMAC key is a random
// secret kept in the database (AppConfig.sessionSecret), never in the code
// or derived from the PIN — the repository is public, so anything computable
// from the code plus a 6-digit PIN can be brute-forced.
//
// Pure functions only, so they can be tested without a database.

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000

function mac(secret: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`pit-dashboard:${expiresAt}`).digest("hex")
}

export function signSession(secret: string, expiresAt: number): string {
  return `${expiresAt}.${mac(secret, expiresAt)}`
}

export function verifySession(secret: string, token: string | undefined, now: number): boolean {
  if (!secret || !token) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const expiresAt = Number(token.slice(0, dot))
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false
  const given = Buffer.from(token.slice(dot + 1), "hex")
  const expected = Buffer.from(mac(secret, expiresAt), "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}
