import { describe, expect, it } from "vitest"
import { findOpenIssue, badSince, weeklyCell } from "./inspectionRow"
import type { Stage } from "@/lib/review"

// history entries only need the fields these functions actually read —
// not a full InspectionRow — so build minimal fakes directly rather than
// going through buildRow()/Prisma.
function row(stage: Stage | "none", isoCreatedAt: string, shift: "Day" | "Night" = "Day") {
  const createdAt = new Date(isoCreatedAt)
  return {
    stage,
    inspection: {
      createdAt,
      date: createdAt.toISOString().slice(0, 10),
      shift,
      firstName: "Test",
      lastName: "Worker",
    },
  }
}

describe("findOpenIssue", () => {
  it("returns null when nothing is open", () => {
    const history = [row("clean", "2026-08-20T09:00:00Z"), row("confirmed", "2026-08-19T09:00:00Z")]
    expect(findOpenIssue(history)).toBeNull()
  })

  it(
    "REGRESSION: an unresolved flag is not cleared by a later inspection that simply " +
      "didn't re-flag it — this was a real bug where a worker's routine 'all good' shift " +
      "silently erased an outstanding, never-reviewed safety issue",
    () => {
      const history = [
        row("clean", "2026-08-20T09:00:00Z"), // newest: Tuesday's routine check, nothing flagged
        row("unresolved", "2026-08-19T09:00:00Z"), // Monday: flagged, never confirmed
      ]
      const open = findOpenIssue(history)
      expect(open?.stage).toBe("unresolved")
      expect(open?.inspection.date).toBe("2026-08-19")
    }
  )

  it("prefers unresolved over pending-confirm even when pending-confirm is more recent", () => {
    const history = [
      row("pending-confirm", "2026-08-20T09:00:00Z"),
      row("unresolved", "2026-08-18T09:00:00Z"),
    ]
    expect(findOpenIssue(history)?.stage).toBe("unresolved")
  })

  it("among same-severity open issues, picks the oldest (longest-open) one", () => {
    const history = [
      row("unresolved", "2026-08-20T09:00:00Z"),
      row("unresolved", "2026-08-15T09:00:00Z"),
      row("clean", "2026-08-22T09:00:00Z"),
    ]
    expect(findOpenIssue(history)?.inspection.date).toBe("2026-08-15")
  })

  it("an issue stops being open once its own record is marked confirmed", () => {
    const history = [
      row("confirmed", "2026-08-20T09:00:00Z"), // same underlying inspection, now signed off
    ]
    expect(findOpenIssue(history)).toBeNull()
  })
})

describe("badSince", () => {
  it("returns null when there's no open issue", () => {
    expect(badSince([row("clean", "2026-08-20T09:00:00Z")], "2026-08-22")).toBeNull()
  })

  it("returns the open issue's date, not just the most recent bad shift", () => {
    const history = [
      row("clean", "2026-08-20T09:00:00Z"),
      row("unresolved", "2026-08-15T09:00:00Z"),
    ]
    expect(badSince(history, "2026-08-22")).toBe("2026-08-15")
  })

  it("doesn't flag an issue from today itself as 'days passed'", () => {
    expect(badSince([row("unresolved", "2026-08-22T09:00:00Z")], "2026-08-22")).toBeNull()
  })
})

describe("weeklyCell", () => {
  const history = [
    row("unresolved", "2026-08-17T13:00:00Z", "Day"), // 9am Eastern, inside Day window
    row("clean", "2026-08-17T22:00:00Z", "Night"), // 6pm Eastern, inside Night window
  ]

  it("finds the inspection that actually falls inside the requested shift window", () => {
    expect(weeklyCell(history, "2026-08-17", "Day").stage).toBe("unresolved")
    expect(weeklyCell(history, "2026-08-17", "Night").stage).toBe("clean")
  })

  it("returns 'none' with no inspector when nothing happened that shift", () => {
    const cell = weeklyCell(history, "2026-08-18", "Day")
    expect(cell.stage).toBe("none")
    expect(cell.inspectorName).toBeNull()
  })

  it("still reports the true historical stage for that exact day even if a later day is open", () => {
    // The Weekly Report must keep showing what actually happened on 8/17,
    // independent of findOpenIssue's fleet-status logic above.
    expect(weeklyCell(history, "2026-08-17", "Day").stage).toBe("unresolved")
  })
})
