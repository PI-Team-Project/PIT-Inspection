import { createHash } from "crypto"

export const DASHBOARD_COOKIE = "dashboard_session"
export const MANAGER_NAME_COOKIE = "manager_name"
export const PIN_ATTEMPTS_COOKIE = "pin_attempts"

// A single shared 6-digit PIN with no lockout was brute-forceable — this is
// cookie-based, not IP/account-based (there's no server-side store here),
// so clearing cookies resets it. Still real friction against a naive script
// blindly POSTing guesses, which is the actual threat model for this app.
const MAX_PIN_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000

export function isValidPin(pin: string) {
  return pin.length > 0 && pin === (process.env.DASHBOARD_PIN ?? "")
}

export function dashboardSessionValue() {
  return createHash("sha256")
    .update(`pit-dashboard:${process.env.DASHBOARD_PIN ?? ""}`)
    .digest("hex")
}

type PinAttemptState = { count: number; lockedUntil?: number }

function parsePinAttemptState(raw: string | undefined): PinAttemptState {
  if (!raw) return { count: 0 }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.count === "number") return parsed
  } catch {
    // fall through to a fresh state below
  }
  return { count: 0 }
}

// Checked before even looking at the submitted PIN — a locked-out client
// shouldn't get a free extra guess while we're computing the rejection.
export function getPinLockout(raw: string | undefined): { lockedUntil: number } | null {
  const state = parsePinAttemptState(raw)
  return state.lockedUntil && state.lockedUntil > Date.now() ? { lockedUntil: state.lockedUntil } : null
}

// Called after a wrong PIN — returns the new cookie value plus whether this
// attempt just tripped the lockout.
export function recordFailedPinAttempt(raw: string | undefined): {
  cookieValue: string
  lockedUntil: number | null
} {
  const state = parsePinAttemptState(raw)
  const count = state.count + 1
  if (count >= MAX_PIN_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCKOUT_MS
    return { cookieValue: JSON.stringify({ count: 0, lockedUntil }), lockedUntil }
  }
  return { cookieValue: JSON.stringify({ count }), lockedUntil: null }
}
