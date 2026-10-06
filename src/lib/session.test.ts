import { describe, expect, it } from "vitest"
import { SESSION_TTL_MS, signSession, verifySession } from "./session"

const secret = "a".repeat(64)
const now = 1_790_000_000_000

describe("dashboard session token", () => {
  it("accepts a token it signed until it expires", () => {
    const token = signSession(secret, now + SESSION_TTL_MS)
    expect(verifySession(secret, token, now)).toBe(true)
    expect(verifySession(secret, token, now + SESSION_TTL_MS)).toBe(false)
  })

  it("rejects a token signed with another secret (e.g. after a PIN change)", () => {
    const token = signSession("b".repeat(64), now + SESSION_TTL_MS)
    expect(verifySession(secret, token, now)).toBe(false)
  })

  it("rejects a token whose expiry was edited", () => {
    const token = signSession(secret, now + 1000)
    const [, sig] = token.split(".")
    expect(verifySession(secret, `${now + SESSION_TTL_MS * 10}.${sig}`, now)).toBe(false)
  })

  it("rejects malformed values, including the old fixed cookie", () => {
    for (const bad of [undefined, "", "abc", ".abc", "123.", "x".repeat(64), `${now + 1000}.zz`]) {
      expect(verifySession(secret, bad, now)).toBe(false)
    }
  })

  it("rejects everything when no secret is set", () => {
    expect(verifySession("", signSession("", now + 1000), now)).toBe(false)
  })
})
