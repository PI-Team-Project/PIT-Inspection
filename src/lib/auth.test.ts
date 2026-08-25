import { describe, expect, it, beforeEach, afterEach } from "vitest"
import {
  isValidPin,
  dashboardSessionValue,
  getPinLockout,
  recordFailedPinAttempt,
} from "./auth"

describe("isValidPin", () => {
  const original = process.env.DASHBOARD_PIN
  beforeEach(() => {
    process.env.DASHBOARD_PIN = "123456"
  })
  afterEach(() => {
    process.env.DASHBOARD_PIN = original
  })

  it("accepts the configured PIN", () => {
    expect(isValidPin("123456")).toBe(true)
  })

  it("rejects a wrong PIN", () => {
    expect(isValidPin("000000")).toBe(false)
  })

  it("rejects an empty string even if DASHBOARD_PIN is also unset/empty", () => {
    process.env.DASHBOARD_PIN = ""
    expect(isValidPin("")).toBe(false)
  })
})

describe("dashboardSessionValue", () => {
  const original = process.env.DASHBOARD_PIN
  afterEach(() => {
    process.env.DASHBOARD_PIN = original
  })

  it("is deterministic for the same PIN", () => {
    process.env.DASHBOARD_PIN = "123456"
    expect(dashboardSessionValue()).toBe(dashboardSessionValue())
  })

  it("changes if the PIN changes", () => {
    process.env.DASHBOARD_PIN = "123456"
    const a = dashboardSessionValue()
    process.env.DASHBOARD_PIN = "654321"
    const b = dashboardSessionValue()
    expect(a).not.toBe(b)
  })
})

describe("getPinLockout", () => {
  it("returns null with no cookie at all", () => {
    expect(getPinLockout(undefined)).toBeNull()
  })

  it("returns null for a fresh/non-locked attempt state", () => {
    expect(getPinLockout(JSON.stringify({ count: 2 }))).toBeNull()
  })

  it("returns the lockout when lockedUntil is in the future", () => {
    const lockedUntil = Date.now() + 60_000
    expect(getPinLockout(JSON.stringify({ count: 0, lockedUntil }))).toEqual({ lockedUntil })
  })

  it("returns null once lockedUntil is in the past (lockout expired)", () => {
    const lockedUntil = Date.now() - 1000
    expect(getPinLockout(JSON.stringify({ count: 0, lockedUntil }))).toBeNull()
  })

  it("treats corrupt/garbage cookie values as a fresh state, not a crash", () => {
    expect(getPinLockout("not json at all")).toBeNull()
  })
})

describe("recordFailedPinAttempt", () => {
  it("increments the count without locking below the max", () => {
    const result = recordFailedPinAttempt(JSON.stringify({ count: 2 }))
    expect(result.lockedUntil).toBeNull()
    expect(JSON.parse(result.cookieValue)).toEqual({ count: 3 })
  })

  it("starts at count 1 with no prior cookie", () => {
    const result = recordFailedPinAttempt(undefined)
    expect(JSON.parse(result.cookieValue)).toEqual({ count: 1 })
  })

  it("REGRESSION: the 5th failed attempt trips the lockout and resets the visible count to 0", () => {
    const result = recordFailedPinAttempt(JSON.stringify({ count: 4 }))
    expect(result.lockedUntil).not.toBeNull()
    expect(result.lockedUntil).toBeGreaterThan(Date.now())
    const parsed = JSON.parse(result.cookieValue)
    expect(parsed.count).toBe(0)
    expect(parsed.lockedUntil).toBe(result.lockedUntil)
  })

  it("a corrupt prior cookie is treated as count 0, not a crash", () => {
    const result = recordFailedPinAttempt("{garbage")
    expect(JSON.parse(result.cookieValue)).toEqual({ count: 1 })
  })
})
