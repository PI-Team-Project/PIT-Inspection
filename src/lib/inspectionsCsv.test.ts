import { describe, expect, it } from "vitest"
import { buildInspectionsCsv } from "./inspectionsCsv"
import type { Inspection } from "@/generated/prisma/client"

// Every checklist question needs an explicit "good" answer to produce a
// truly clean inspection — an unanswered question counts as flagged, same
// as review.test.ts's flaggedIssueIds fixture.
const ALL_GOOD_ANSWERS = {
  tires: { value: "Good" },
  fluidBattery: { value: "Good" },
  batteryPlug: { value: "Good (No Exposed Wire)" },
  batteryIndicator: { value: "Good" },
  fluidLeaks: { value: "No" },
  bodyCondition: { value: "Good" },
  horn: { value: "Good" },
  forwardBackward: { value: "Working condition" },
  liftLowering: { value: "Working condition" },
}

function baseInspection(overrides: Partial<Inspection>): Inspection {
  return {
    id: "insp-1",
    createdAt: new Date("2026-08-20T13:00:00Z"),
    type: "Daily",
    date: "2026-08-20",
    shift: "Day",
    lastName: "Worker",
    firstName: "Test",
    equipmentLabel: "R-MIT-0348",
    equipmentSerial: "TEST-1",
    answers: ALL_GOOD_ANSWERS,
    review: null,
    ...overrides,
  } as Inspection
}

function statusColumn(csv: string): string {
  const rows = csv.split("\r\n")
  const headerCells = rows[0].split(",")
  const statusIndex = headerCells.indexOf("Status")
  return rows[1].split(",")[statusIndex]
}

describe("buildInspectionsCsv status column", () => {
  it("REGRESSION: a Daily inspection with an unresolved SAFETY-CRITICAL flag exports as Unresolved, not Needs Attention", () => {
    // "horn" is one of the safety-critical questions — flagging it on a
    // Daily inspection must escalate to the same severity as a Repair
    // Request, exactly like the live dashboard does via criticalFlaggedIds.
    // The old code only ever checked isCriticalInspection(type), which is
    // false for "Daily", so this used to under-report as "Needs Attention".
    const csv = buildInspectionsCsv([
      baseInspection({ answers: { ...ALL_GOOD_ANSWERS, horn: { value: "Poor" } } }),
    ])
    expect(statusColumn(csv)).toBe("Unresolved")
  })

  it("a Daily inspection with a non-critical flag (e.g. tires) exports as Needs Attention, not Unresolved", () => {
    const csv = buildInspectionsCsv([
      baseInspection({ answers: { ...ALL_GOOD_ANSWERS, tires: { value: "Poor" } } }),
    ])
    expect(statusColumn(csv)).toBe("Needs Attention")
  })

  it("a Repair Request exports as Unresolved until completed and confirmed", () => {
    const csv = buildInspectionsCsv([
      baseInspection({
        type: "Repair Request",
        answers: { repairRequest: { value: "Yes" } },
      }),
    ])
    expect(statusColumn(csv)).toBe("Unresolved")
  })

  it("a fully clean inspection exports as All Good", () => {
    const csv = buildInspectionsCsv([baseInspection({})])
    expect(statusColumn(csv)).toBe("All Good")
  })

  it("a flagged-then-confirmed inspection exports as Resolved & Confirmed", () => {
    const csv = buildInspectionsCsv([
      baseInspection({
        answers: { ...ALL_GOOD_ANSWERS, horn: { value: "Poor" } },
        review: {
          issueStatus: { horn: "complete" },
          activity: [],
          confirmedResolved: true,
        },
      }),
    ])
    expect(statusColumn(csv)).toBe("Resolved & Confirmed")
  })

  it("a flagged, all-complete-but-not-yet-confirmed inspection exports as Needs Attention", () => {
    const csv = buildInspectionsCsv([
      baseInspection({
        answers: { ...ALL_GOOD_ANSWERS, tires: { value: "Poor" } },
        review: {
          issueStatus: { tires: "complete" },
          activity: [],
          confirmedResolved: false,
        },
      }),
    ])
    expect(statusColumn(csv)).toBe("Needs Attention")
  })

  it("escapes commas, quotes, and newlines in free-text fields", () => {
    const csv = buildInspectionsCsv([
      baseInspection({
        firstName: 'Jo"e, the "boss"',
        answers: { ...ALL_GOOD_ANSWERS, tires: { value: "Other (Specify)", specify: "cut, needs\nreplacing" } },
      }),
    ])
    const dataPortion = csv.split("\r\n").slice(1).join("\n")
    expect(dataPortion).toContain('"Jo""e, the ""boss"""')
    expect(dataPortion).toContain('"Other (Specify) - cut, needs\nreplacing"')
  })
})
