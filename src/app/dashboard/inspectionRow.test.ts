import { describe, expect, it } from "vitest"
import { findOpenIssue, findAllOpenIssues, badSince, weeklyCell } from "./inspectionRow"
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

describe("findAllOpenIssues", () => {
  it(
    "REGRESSION (MIT-2304): confirming a newer separate flag must not hide an older, " +
      "still-untouched one — both are real, independent open issues",
    () => {
      const history = [
        row("confirmed", "2026-08-10T20:00:00Z", "Night"), // reviewed and signed off
        row("unresolved", "2026-08-07T09:00:00Z", "Day"), // a different, never-touched flag
      ]
      const open = findAllOpenIssues(history)
      expect(open).toHaveLength(1)
      expect(open[0].inspection.date).toBe("2026-08-07")
    }
  )

  it("returns every open issue, worst/oldest first, when more than one is still open", () => {
    const history = [
      row("pending-confirm", "2026-08-20T09:00:00Z"),
      row("unresolved", "2026-08-18T09:00:00Z"),
      row("unresolved", "2026-08-15T09:00:00Z"),
      row("clean", "2026-08-22T09:00:00Z"),
    ]
    const open = findAllOpenIssues(history)
    expect(open.map((r) => r.inspection.date)).toEqual(["2026-08-15", "2026-08-18", "2026-08-20"])
  })

  it("returns an empty array when nothing is open", () => {
    expect(findAllOpenIssues([row("clean", "2026-08-20T09:00:00Z")])).toEqual([])
  })

  it("returns an empty array for an equipment with no inspections at all", () => {
    expect(findAllOpenIssues([])).toEqual([])
    expect(findOpenIssue([])).toBeNull()
  })

  it("a single unresolved inspection (no history at all otherwise) is open", () => {
    const open = findAllOpenIssues([row("unresolved", "2026-08-20T09:00:00Z")])
    expect(open).toHaveLength(1)
  })

  it("a single pending-confirm inspection (no history otherwise) is open", () => {
    const open = findAllOpenIssues([row("pending-confirm", "2026-08-20T09:00:00Z")])
    expect(open).toHaveLength(1)
  })

  it("an older pending-confirm survives being masked by a newer clean inspection, same as unresolved does", () => {
    const history = [
      row("clean", "2026-08-20T09:00:00Z"),
      row("pending-confirm", "2026-08-15T09:00:00Z"),
    ]
    const open = findAllOpenIssues(history)
    expect(open).toHaveLength(1)
    expect(open[0].stage).toBe("pending-confirm")
  })

  it("confirming one of two open issues leaves the other one open", () => {
    const history = [
      row("unresolved", "2026-08-18T09:00:00Z"),
      row("unresolved", "2026-08-15T09:00:00Z"),
    ]
    expect(findAllOpenIssues(history)).toHaveLength(2)

    // The 8/15 report gets reviewed and confirmed — its OWN stage flips to
    // "confirmed" (this doesn't touch the other row at all, matching what
    // saveActivity actually does: it updates a single inspection record).
    const afterConfirming15th = [
      row("unresolved", "2026-08-18T09:00:00Z"),
      row("confirmed", "2026-08-15T09:00:00Z"),
    ]
    const open = findAllOpenIssues(afterConfirming15th)
    expect(open).toHaveLength(1)
    expect(open[0].inspection.date).toBe("2026-08-18")
  })
})

describe("badSince with multiple simultaneously open issues", () => {
  it(
    "SUBTLE CASE: a newer unresolved issue outranks an older pending-confirm one for " +
      "severity, so badSince/daysPassed tracks the newer date — potentially UNDERSTATING " +
      "how long the older, less-severe issue has actually been open. Documenting the " +
      "current behavior rather than asserting it's ideal.",
    () => {
      const history = [
        row("unresolved", "2026-08-20T09:00:00Z"), // more severe, but newer
        row("pending-confirm", "2026-08-10T09:00:00Z"), // been open 10 days longer
      ]
      // findOpenIssue picks the unresolved one (severity beats age)...
      expect(findOpenIssue(history)?.inspection.date).toBe("2026-08-20")
      // ...so "days passed" reports from 8/20, not the true oldest-open 8/10.
      expect(badSince(history, "2026-08-22")).toBe("2026-08-20")
    }
  )
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
