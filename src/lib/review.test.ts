import { describe, expect, it } from "vitest"
import {
  getStage,
  parseReview,
  isCriticalInspection,
  isCriticalFlag,
  criticalFlaggedIds,
  flaggedIssueIds,
  EMPTY_REVIEW,
} from "./review"

describe("getStage", () => {
  it("is clean when nothing was flagged", () => {
    expect(getStage(0, 0, false, true)).toBe("clean")
  })

  it("is unresolved whenever any critical flag is still open, regardless of confirm state", () => {
    expect(getStage(2, 1, false, false)).toBe("unresolved")
    expect(getStage(2, 1, true, false)).toBe("unresolved")
  })

  it("is pending-confirm when flags exist but aren't all marked complete yet", () => {
    expect(getStage(2, 0, false, false)).toBe("pending-confirm")
    // A supervisor confirming without finishing every flagged item still
    // isn't trusted as done — this guards exactly that bug.
    expect(getStage(2, 0, true, false)).toBe("pending-confirm")
  })

  it("is pending-confirm (not confirmed) once complete but not yet signed off", () => {
    expect(getStage(1, 0, false, true)).toBe("pending-confirm")
  })

  it("is confirmed only once every flagged item is complete AND signed off", () => {
    expect(getStage(1, 0, true, true)).toBe("confirmed")
  })
})

describe("parseReview", () => {
  it("returns EMPTY_REVIEW for null/non-object input", () => {
    expect(parseReview(null)).toEqual(EMPTY_REVIEW)
    expect(parseReview(undefined)).toEqual(EMPTY_REVIEW)
    expect(parseReview("nonsense")).toEqual(EMPTY_REVIEW)
  })

  it("round-trips a well-formed review", () => {
    const input = {
      issueStatus: { horn: "complete" },
      activity: [{ id: "1", type: "note", text: "hi", authorName: "A", timestamp: "t" }],
      confirmedResolved: true,
    }
    expect(parseReview(input)).toEqual(input)
  })

  it("upgrades the legacy boolean issueStatus shape to 'complete'", () => {
    const parsed = parseReview({ issueStatus: { horn: true } })
    expect(parsed.issueStatus.horn).toBe("complete")
  })

  it("drops garbage issueStatus values instead of throwing", () => {
    const parsed = parseReview({ issueStatus: { horn: "not-a-real-status" } })
    expect(parsed.issueStatus.horn).toBeUndefined()
  })
})

describe("critical flag escalation", () => {
  it("a Repair Request is always critical regardless of content", () => {
    expect(isCriticalInspection({ type: "Repair Request" })).toBe(true)
    expect(isCriticalInspection({ type: "Daily" })).toBe(false)
  })

  it("a Daily inspection escalates only for safety-critical questions", () => {
    expect(isCriticalFlag({ type: "Daily" }, "horn")).toBe(true)
    expect(isCriticalFlag({ type: "Daily" }, "tires")).toBe(false)
  })

  it("criticalFlaggedIds filters down to just the critical subset", () => {
    const ids = criticalFlaggedIds({ type: "Daily" }, ["horn", "tires", "fluidLeaks"])
    expect(ids).toEqual(["horn", "fluidLeaks"])
  })

  it("flaggedIssueIds returns the single synthetic issue for a Repair Request", () => {
    expect(flaggedIssueIds({ type: "Repair Request" }, {})).toEqual(["repairRequest"])
  })

  it("flaggedIssueIds finds bad checklist answers for a Daily inspection", () => {
    // An unanswered question also counts as flagged (empty string isn't a
    // "good" answer) — every other question needs a real good answer here
    // so only "tires" shows up as flagged.
    const answers = {
      tires: { value: "Poor" },
      fluidBattery: { value: "Good" },
      batteryPlug: { value: "Good (No Exposed Wire)" },
      batteryIndicator: { value: "Good" },
      fluidLeaks: { value: "No" },
      bodyCondition: { value: "Good" },
      horn: { value: "Good" },
      forwardBackward: { value: "Working condition" },
      liftLowering: { value: "Working condition" },
    }
    expect(flaggedIssueIds({ type: "Daily" }, answers)).toEqual(["tires"])
  })
})
