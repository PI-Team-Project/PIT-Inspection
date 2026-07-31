export type Review = {
  acknowledged: boolean
  notes: string
  issueStatus: Record<string, boolean>
}

export const EMPTY_REVIEW: Review = {
  acknowledged: false,
  notes: "",
  issueStatus: {},
}

export function parseReview(value: unknown): Review {
  if (!value || typeof value !== "object") return EMPTY_REVIEW
  const v = value as Partial<Review>
  return {
    acknowledged: Boolean(v.acknowledged),
    notes: typeof v.notes === "string" ? v.notes : "",
    issueStatus:
      v.issueStatus && typeof v.issueStatus === "object" ? v.issueStatus : {},
  }
}
