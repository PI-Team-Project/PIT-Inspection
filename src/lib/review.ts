import { QUESTIONS, REPAIR_REQUEST_ISSUE_ID, needsAttention, isSafetyCriticalQuestion } from "./questions"

export type IssueStatusValue = "in_review" | "complete"

export type ActivityEntry =
  | { id: string; type: "note"; text: string; authorName: string; timestamp: string }
  | {
      id: string
      type: "issue"
      questionId: string
      status: IssueStatusValue
      authorName: string
      timestamp: string
    }
  | { id: string; type: "viewed"; authorName: string; timestamp: string }
  | { id: string; type: "confirmed"; authorName: string; timestamp: string }
  | {
      id: string
      type: "location"
      location: string
      authorName: string
      timestamp: string
    }

export type Review = {
  issueStatus: Record<string, IssueStatusValue>
  activity: ActivityEntry[]
  confirmedResolved: boolean
}

export const EMPTY_REVIEW: Review = {
  issueStatus: {},
  activity: [],
  confirmedResolved: false,
}

function isIssueStatusValue(v: unknown): v is IssueStatusValue {
  return v === "in_review" || v === "complete"
}

export function parseReview(value: unknown): Review {
  if (!value || typeof value !== "object") return EMPTY_REVIEW
  const v = value as Partial<Review>

  const issueStatus: Record<string, IssueStatusValue> = {}
  if (v.issueStatus && typeof v.issueStatus === "object") {
    for (const [key, val] of Object.entries(v.issueStatus)) {
      if (isIssueStatusValue(val)) {
        issueStatus[key] = val
      } else if (val === true) {
        // backward-compat with the old boolean issueStatus shape
        issueStatus[key] = "complete"
      }
    }
  }

  return {
    issueStatus,
    activity: Array.isArray(v.activity) ? (v.activity as ActivityEntry[]) : [],
    confirmedResolved: Boolean(v.confirmedResolved),
  }
}

// A "Repair Request" submission is inherently critical (RED) regardless of
// what it says. A "Daily" submission tops out at YELLOW (usable, needs
// attention) — UNLESS the specific flagged question is one of the
// safety-critical ones (see isCriticalFlag below), which escalates it too.
export function isCriticalInspection(inspection: { type: string }): boolean {
  return inspection.type === "Repair Request"
}

// Whether one flagged question should count toward Unresolved (red)
// severity: the whole inspection already is (Repair Request), or this
// specific question is unsafe-if-bad regardless of inspection type.
export function isCriticalFlag(inspection: { type: string }, questionId: string): boolean {
  return isCriticalInspection(inspection) || isSafetyCriticalQuestion(questionId)
}

export function criticalFlaggedIds(inspection: { type: string }, flaggedIds: string[]): string[] {
  return flaggedIds.filter((id) => isCriticalFlag(inspection, id))
}

// The set of issue ids "flagged" on this inspection — the checklist
// questions with a bad answer for a Daily inspection, or the single
// synthetic issue for a Repair Request (which has no checklist).
export function flaggedIssueIds(
  inspection: { type: string },
  answers: Record<string, { value: string }>
): string[] {
  if (isCriticalInspection(inspection)) return [REPAIR_REQUEST_ISSUE_ID]
  return QUESTIONS.filter((q) => needsAttention(answers[q.id]?.value ?? "")).map(
    (q) => q.id
  )
}

// A submission's lifecycle stage, driven by its flagged/unresolved issues and
// whether a manager has done the final confirm-all-clear step.
export type Stage = "unresolved" | "pending-confirm" | "confirmed" | "clean"

export function getStage(
  flaggedCount: number,
  unresolvedCount: number,
  confirmedResolved: boolean,
  allFlaggedComplete: boolean
): Stage {
  if (flaggedCount === 0) return "clean"
  if (unresolvedCount > 0) return "unresolved"
  // confirmedResolved alone isn't trusted here — if any flagged item (not
  // just the critical ones) is still sitting incomplete, this can't show as
  // confirmed/green no matter what was previously recorded. A supervisor
  // confirming without finishing every item is exactly the bug this guards.
  if (!allFlaggedComplete) return "pending-confirm"
  return confirmedResolved ? "confirmed" : "pending-confirm"
}
