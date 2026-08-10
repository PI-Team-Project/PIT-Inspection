import { prisma } from "@/lib/prisma"
import {
  QUESTIONS_BY_ID,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_QUESTION,
} from "@/lib/questions"
import {
  parseReview,
  getStage,
  isCriticalInspection,
  flaggedIssueIds,
  type Stage,
} from "@/lib/review"
import type { EquipmentType } from "@/lib/equipment"

export type Answers = Record<
  string,
  {
    value: string
    specify?: string
    note?: string
    photos?: string[]
    photoNotes?: string[]
  }
>

export type InspectionRow = ReturnType<typeof buildRow>

export function buildRow(
  inspection: Awaited<ReturnType<typeof prisma.inspection.findMany>>[number]
) {
  const answers = inspection.answers as Answers
  const review = parseReview(inspection.review)
  const flagged = flaggedIssueIds(inspection, answers).map(
    (id) => (id === REPAIR_REQUEST_ISSUE_ID ? REPAIR_REQUEST_QUESTION : QUESTIONS_BY_ID[id])
  )
  const critical = isCriticalInspection(inspection) ? flagged : []
  const unresolved = critical.filter((q) => review.issueStatus[q.id] !== "complete")
  const allFlaggedComplete = flagged.every((q) => review.issueStatus[q.id] === "complete")
  const stage = getStage(
    flagged.length,
    unresolved.length,
    review.confirmedResolved,
    allFlaggedComplete
  )
  return { inspection, answers, review, flagged, critical, unresolved, stage }
}

// Bad status is only "seen" if it's been sitting since a prior calendar day —
// walks back through history while the equipment stays unresolved/pending-confirm.
export function badSince(history: { stage: Stage | "none"; inspection: { date: string } }[], today: string): string | null {
  let since: string | null = null
  for (const row of history) {
    if (row.stage === "unresolved" || row.stage === "pending-confirm") {
      since = row.inspection.date
    } else {
      break
    }
  }
  return since && since < today ? since : null
}

// Forklift inspection/activity history is dropped after 2 years; pallet
// jacks are kept longer (5 years) for now — separate retention windows per
// equipment category, not a single blanket cutoff.
export const RETENTION_YEARS: Record<EquipmentType, number> = {
  "Sit Down": 2,
  Propane: 2,
  Standup: 2,
  "Pallet Jack": 5,
}

export function retentionCutoff(type: EquipmentType, today: string): string {
  const cutoff = new Date(today)
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS[type])
  return cutoff.toISOString().slice(0, 10)
}

export function daysPassedCount(since: string, today: string): number {
  return Math.round(
    (new Date(today).getTime() - new Date(since).getTime()) / (1000 * 60 * 60 * 24)
  )
}
