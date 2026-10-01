import { describe, expect, it } from "vitest"
import { MAX_SUPERVISOR_NAME_LENGTH, normalizeSupervisorName } from "./supervisors"

describe("normalizeSupervisorName", () => {
  it("trims and collapses inner whitespace so one person is one entry", () => {
    expect(normalizeSupervisorName("  Bum   Yoon  Kim ")).toBe("Bum Yoon Kim")
  })

  it("caps the length", () => {
    expect(normalizeSupervisorName("x".repeat(100))).toHaveLength(MAX_SUPERVISOR_NAME_LENGTH)
  })

  it("returns empty for a blank name", () => {
    expect(normalizeSupervisorName("   ")).toBe("")
  })
})
