import { describe, expect, it } from "vitest"
import { hashPin, pinMatches } from "./dashboardPin"

// Session signing is covered in session.test.ts; the DB login throttle and
// session secret need a database and were checked on staging.

describe("PIN hashing", () => {
  it("matches the PIN it hashed and nothing else", () => {
    const stored = hashPin("482913")
    expect(stored.startsWith("scrypt$")).toBe(true)
    expect(pinMatches("482913", stored)).toBe(true)
    expect(pinMatches("482914", stored)).toBe(false)
  })

  it("salts every hash, so the same PIN never stores the same value", () => {
    expect(hashPin("482913")).not.toBe(hashPin("482913"))
  })

  it("still accepts a PIN stored with the old unsalted hash", async () => {
    const { createHash } = await import("crypto")
    const legacy = createHash("sha256").update("pit-pin:482913").digest("hex")
    expect(pinMatches("482913", legacy)).toBe(true)
    expect(pinMatches("000000", legacy)).toBe(false)
  })

  it("rejects empty input and malformed stored values", () => {
    expect(pinMatches("", hashPin("1"))).toBe(false)
    expect(pinMatches("482913", "")).toBe(false)
    expect(pinMatches("482913", "scrypt$only-one-part")).toBe(false)
  })
})
