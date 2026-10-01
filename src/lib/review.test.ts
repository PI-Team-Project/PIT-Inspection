import { describe, expect, it } from "vitest"
import {
  getStage,
  parseReview,
  isCriticalInspection,
  isCriticalFlag,
  criticalFlaggedIds,
  flaggedIssueIds,
  cascadeIssueComplete,
  EMPTY_REVIEW,
  type Review,
} from "./review"
import { QUESTIONS, REPAIR_REQUEST_ISSUE_ID } from "./questions"

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

describe("cascadeIssueComplete", () => {
  // Every checklist question answered Good except the ids given.
  const answersWithBad = (...bad: string[]) =>
    Object.fromEntries(QUESTIONS.map((q) => [q.id, { value: bad.includes(q.id) ? "Bad" : "Good" }]))
  const by = {
    authorName: "Sup",
    timestamp: "2026-10-01T12:00:00.000Z",
    appliedFrom: { inspectionId: "latest", date: "2026-10-01", shift: "Day" },
  }
  const daily = (review: Review, ...bad: string[]) => ({
    type: "Daily",
    answers: answersWithBad(...bad),
    review,
  })

  it("closes the same issue on an earlier inspection and confirms it when nothing else is open", () => {
    const next = cascadeIssueComplete(daily(EMPTY_REVIEW, "tires"), ["tires"], by)
    expect(next?.issueStatus.tires).toBe("complete")
    expect(next?.confirmedResolved).toBe(true)
    expect(next?.activity.map((a) => a.type)).toEqual(["issue", "confirmed"])
    expect(next?.activity[0]).toMatchObject({ appliedFrom: by.appliedFrom })
  })

  it("leaves a different still-open issue open, so the earlier inspection stays unconfirmed", () => {
    const next = cascadeIssueComplete(daily(EMPTY_REVIEW, "tires", "batteryPlug"), ["tires"], by)
    expect(next?.issueStatus.tires).toBe("complete")
    expect(next?.issueStatus.batteryPlug).toBeUndefined()
    expect(next?.confirmedResolved).toBe(false)
  })

  it("changes nothing when the earlier inspection never flagged that issue", () => {
    expect(cascadeIssueComplete(daily(EMPTY_REVIEW, "batteryPlug"), ["tires"], by)).toBeNull()
  })

  it("changes nothing when the issue is already complete there", () => {
    const done: Review = { ...EMPTY_REVIEW, issueStatus: { tires: "complete" } }
    expect(cascadeIssueComplete(daily(done, "tires", "batteryPlug"), ["tires"], by)).toBeNull()
  })

  it("never cascades between Repair Requests, which share one id but not one problem", () => {
    const repair = { type: "Repair Request", answers: {}, review: EMPTY_REVIEW }
    expect(cascadeIssueComplete(repair, [REPAIR_REQUEST_ISSUE_ID], by)).toBeNull()
  })
})
