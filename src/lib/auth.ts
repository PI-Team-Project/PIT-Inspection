import { cookies } from "next/headers"
import { getSessionSecret } from "./dashboardPin"
import { SESSION_TTL_MS, signSession, verifySession } from "./session"

export const DASHBOARD_COOKIE = "dashboard_session"
export const MANAGER_NAME_COOKIE = "manager_name"

// The session cookie is a signed expiry (src/lib/session.ts), keyed by a
// random secret in the database. It used to be sha256 of the env PIN, which
// anyone reading this public repository could brute-force without ever
// touching the login form.
export async function hasDashboardSession(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(DASHBOARD_COOKIE)?.value
  if (!token) return false
  if (verifySession(await getSessionSecret(), token, Date.now())) return true
  // The cached secret may predate a PIN change made on another instance;
  // check once more against the stored one before refusing.
  return verifySession(await getSessionSecret({ fresh: true }), token, Date.now())
}

// Signs a session that expires SESSION_TTL_MS from now.
export async function newDashboardSessionToken(): Promise<string> {
  return signSession(await getSessionSecret(), Date.now() + SESSION_TTL_MS)
}

// The security boundary for every mutating dashboard action. A Server Action
// is its own POST endpoint reachable by anyone who can send the request —
// gating the PAGE that renders the form does nothing for the action behind
// it (Next.js docs: "Render-time gating is not a security boundary"). Without
// this, a PIN-less request could retire vehicles, rewrite inspection review
// history, or approve location changes directly. Throws loudly (per the docs'
// guidance for destructive operations) rather than silently no-opping, so a
// missed check surfaces instead of looking like success.
export async function requireDashboardSession(): Promise<void> {
  if (!(await hasDashboardSession())) {
    throw new Error("Unauthorized")
  }
}
