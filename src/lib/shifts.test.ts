import { describe, expect, it } from "vitest"
import {
  easternDateKey,
  shiftDateKeyByDays,
  mondayOfWeek,
  getShiftWindowForDate,
  getShiftForDate,
} from "./shifts"

describe("easternDateKey", () => {
  it("formats an Eastern-time instant as YYYY-MM-DD", () => {
    // 2026-08-17 12:00 UTC is 08:00 Eastern (EDT, UTC-4) — same calendar day.
    expect(easternDateKey(new Date("2026-08-17T12:00:00Z"))).toBe("2026-08-17")
  })

  it("rolls back a calendar day for the early-UTC tail of the previous Eastern day", () => {
    // 2026-08-17 02:00 UTC is still 2026-08-16 22:00 Eastern (EDT).
    expect(easternDateKey(new Date("2026-08-17T02:00:00Z"))).toBe("2026-08-16")
  })
})

describe("shiftDateKeyByDays / mondayOfWeek", () => {
  it("walks a date key forward and backward by whole days", () => {
    expect(shiftDateKeyByDays("2026-08-17", 1)).toBe("2026-08-18")
    expect(shiftDateKeyByDays("2026-08-17", -1)).toBe("2026-08-16")
    expect(shiftDateKeyByDays("2026-08-31", 1)).toBe("2026-09-01")
  })

  it("finds the Monday of the week containing a given date, including Sunday wraparound", () => {
    expect(mondayOfWeek("2026-08-19")).toBe("2026-08-17") // Wed -> Mon same week
    expect(mondayOfWeek("2026-08-17")).toBe("2026-08-17") // Mon -> itself
    expect(mondayOfWeek("2026-08-23")).toBe("2026-08-17") // Sun -> previous Mon
  })
})

describe("getShiftWindowForDate", () => {
  it("Day shift runs 5am-5pm Eastern as a real UTC instant range", () => {
    const window = getShiftWindowForDate("2026-08-17", "Day")
    // Mid-August is EDT (UTC-4), so 5am Eastern = 9am UTC.
    expect(window.start.toISOString()).toBe("2026-08-17T09:00:00.000Z")
    expect(window.end.toISOString()).toBe("2026-08-17T21:00:00.000Z")
  })

  it("Night shift runs 5pm-5am Eastern, crossing into the next UTC day", () => {
    const window = getShiftWindowForDate("2026-08-17", "Night")
    expect(window.start.toISOString()).toBe("2026-08-17T21:00:00.000Z")
    expect(window.end.toISOString()).toBe("2026-08-18T09:00:00.000Z")
  })

  it("a timestamp just inside a shift window is classified into that shift", () => {
    const window = getShiftWindowForDate("2026-08-17", "Day")
    const justInside = new Date(window.start.getTime() + 60_000)
    expect(getShiftForDate(justInside)).toBe("Day")
  })

  it("a timestamp just before a shift window is classified into the prior shift", () => {
    const window = getShiftWindowForDate("2026-08-17", "Day")
    const justBefore = new Date(window.start.getTime() - 60_000)
    expect(getShiftForDate(justBefore)).toBe("Night")
  })
})
