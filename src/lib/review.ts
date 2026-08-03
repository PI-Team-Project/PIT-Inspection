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

// A submission's lifecycle stage, driven by its flagged/unresolved issues and
// whether a manager has done the final confirm-all-clear step.
export type Stage = "unresolved" | "pending-confirm" | "confirmed" | "clean"

export function getStage(
  flaggedCount: number,
  unresolvedCount: number,
  confirmedResolved: boolean
): Stage {
  if (flaggedCount === 0) return "clean"
  if (unresolvedCount > 0) return "unresolved"
  return confirmedResolved ? "confirmed" : "pending-confirm"
}
