import { describe, expect, it } from "vitest"
import { completedShifts, computeFleetUsage, usageRangeStart, type UsageVehicle } from "./fleetUsage"
import { getShiftWindowForDate } from "./shifts"

const vehicle = (serial: string, type: string, addedKey = "2026-01-01"): UsageVehicle => ({
  serial,
  flNumber: serial,
  type,
  location: "WH",
  addedKey,
})

const at = (dateKey: string, label: "Day" | "Night", minutes = 30) => ({
  createdAt: new Date(getShiftWindowForDate(dateKey, label).start.getTime() + minutes * 60000),
})

const ORDER = { types: ["Sit Down", "Pallet Jack"], locations: ["WH"] }

describe("usageRangeStart", () => {
  it("goes back 27 days for 4 weeks, so the range is 28 days with today", () => {
    expect(usageRangeStart("4w", "2026-11-03", null)).toBe("2026-10-07")
  })

  it("goes back 13 days for 2 weeks", () => {
    expect(usageRangeStart("2w", "2026-11-03", null)).toBe("2026-10-21")
  })

  it("never starts before the first inspection on record", () => {
    expect(usageRangeStart("3m", "2026-11-03", "2026-09-28")).toBe("2026-09-28")
  })

  it("starts this week on Monday", () => {
    expect(usageRangeStart("week", "2026-11-05", null)).toBe("2026-11-02")
  })
})

describe("completedShifts", () => {
  it("leaves out the shift still in progress", () => {
    // 2026-11-03 12:00 Eastern (EST) — that Day shift has not ended.
    const now = new Date("2026-11-03T17:00:00Z")
    const shifts = completedShifts("2026-11-02", "2026-11-03", now)
    expect(shifts.map((s) => `${s.dateKey} ${s.label}`)).toEqual(["2026-11-02 Day", "2026-11-02 Night"])
  })
})

describe("computeFleetUsage", () => {
  const shifts = completedShifts("2026-10-05", "2026-10-06", new Date("2026-10-08T00:00:00Z"))

  it("counts a vehicle once per shift however many times it was inspected", () => {
    const usage = computeFleetUsage(
      shifts,
      [vehicle("A", "Sit Down"), vehicle("B", "Sit Down")],
      [
        { equipmentSerial: "A", ...at("2026-10-05", "Day") },
        { equipmentSerial: "A", ...at("2026-10-05", "Day", 90) },
      ],
      ORDER
    )
    expect(usage.perShift[0]).toMatchObject({ used: 1, fleet: 2 })
    expect(usage.vehicles[0]).toMatchObject({ serial: "A", shiftsUsed: 1, shiftsInFleet: 4 })
    expect(usage.avgRate).toBeCloseTo(1 / 8)
    expect(usage.vehicles.find((v) => v.serial === "B")?.shiftsUsed).toBe(0)
  })

  it("puts a night inspection after midnight in the night shift that began the day before", () => {
    const usage = computeFleetUsage(
      shifts,
      [vehicle("A", "Sit Down")],
      [{ equipmentSerial: "A", ...at("2026-10-05", "Night", 8 * 60) }],
      ORDER
    )
    expect(usage.perShift.map((s) => s.used)).toEqual([0, 1, 0, 0])
  })

  it("does not count shifts before a vehicle joined the fleet", () => {
    const usage = computeFleetUsage(
      shifts,
      [vehicle("A", "Sit Down"), vehicle("N", "Pallet Jack", "2026-10-06")],
      [{ equipmentSerial: "N", ...at("2026-10-06", "Day") }],
      ORDER
    )
    expect(usage.perShift.map((s) => s.fleet)).toEqual([1, 1, 2, 2])
    expect(usage.vehicles.find((v) => v.serial === "N")).toMatchObject({ shiftsInFleet: 2, rate: 0.5 })
    expect(usage.byType.find((g) => g.label === "Pallet Jack")?.rate).toBe(0.5)
  })

  it("ignores inspections of vehicles no longer in the fleet", () => {
    const usage = computeFleetUsage(
      shifts,
      [vehicle("A", "Sit Down")],
      [{ equipmentSerial: "RETIRED", ...at("2026-10-05", "Day") }],
      ORDER
    )
    expect(usage.perShift[0].used).toBe(0)
  })

  it("takes a group's peak from its busiest single shift", () => {
    const usage = computeFleetUsage(
      shifts,
      [vehicle("A", "Sit Down"), vehicle("B", "Sit Down"), vehicle("C", "Sit Down")],
      [
        { equipmentSerial: "A", ...at("2026-10-05", "Day") },
        { equipmentSerial: "B", ...at("2026-10-05", "Night") },
        { equipmentSerial: "A", ...at("2026-10-06", "Day") },
        { equipmentSerial: "C", ...at("2026-10-06", "Day") },
      ],
      ORDER
    )
    expect(usage.byType[0]).toMatchObject({ label: "Sit Down", vehicles: 3, peak: 2 })
  })

  it("averages the weekday grid per shift", () => {
    const usage = computeFleetUsage(
      shifts,
      [vehicle("A", "Sit Down"), vehicle("B", "Sit Down")],
      [
        { equipmentSerial: "A", ...at("2026-10-05", "Day") },
        { equipmentSerial: "B", ...at("2026-10-05", "Day") },
      ],
      ORDER
    )
    // 2026-10-05 is a Monday.
    expect(usage.weekdayGrid.day[0]).toBe(2)
    expect(usage.weekdayGrid.night[0]).toBe(0)
    expect(usage.weekdayGrid.day[2]).toBeNull()
    expect(usage.peak).toMatchObject({ dateKey: "2026-10-05", label: "Day", used: 2 })
  })
})
