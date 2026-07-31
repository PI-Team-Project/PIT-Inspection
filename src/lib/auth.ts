import { createHash } from "crypto"

export const DASHBOARD_COOKIE = "dashboard_session"

export function isValidPin(pin: string) {
  return pin.length > 0 && pin === (process.env.DASHBOARD_PIN ?? "")
}

export function dashboardSessionValue() {
  return createHash("sha256")
    .update(`pit-dashboard:${process.env.DASHBOARD_PIN ?? ""}`)
    .digest("hex")
}
