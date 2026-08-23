import { prisma } from "@/lib/prisma"
import {
  QUESTIONS_BY_ID,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_QUESTION,
} from "@/lib/questions"
import {
  parseReview,
  getStage,
  criticalFlaggedIds,
  flaggedIssueIds,
  type Stage,
} from "@/lib/review"
import { getShiftWindowForDate } from "@/lib/shifts"
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

// Photos live in their own table now — callers that need them (equipment
// detail) `include: { photos: true }`, callers that only need a yes/no flag
// (dashboard) `include: { _count: { select: { photos: true } } }` instead of
// paying for the actual bytes. Both shapes flow through the same row here.
type RawInspection = Awaited<ReturnType<typeof prisma.inspection.findMany>>[number] & {
  photos?: { questionId: string; order: number; dataUri: string; note: string | null }[]
  _count?: { photos: number }
}

export function buildRow(inspection: RawInspection) {
  const answers = { ...(inspection.answers as Answers) }
  if (inspection.photos) {
    const byQuestion = new Map<string, typeof inspection.photos>()
    for (const photo of inspection.photos) {
      const list = byQuestion.get(photo.questionId)
      if (list) list.push(photo)
      else byQuestion.set(photo.questionId, [photo])
    }
    for (const [questionId, list] of byQuestion) {
      const entry = answers[questionId]
      if (!entry) continue
      list.sort((a, b) => a.order - b.order)
      answers[questionId] = {
        ...entry,
        photos: list.map((p) => p.dataUri),
        ...(list.some((p) => p.note) ? { photoNotes: list.map((p) => p.note ?? "") } : {}),
      }
    }
  }
  const review = parseReview(inspection.review)
  const flaggedIds = flaggedIssueIds(inspection, answers)
  const toQuestion = (id: string) =>
    id === REPAIR_REQUEST_ISSUE_ID ? REPAIR_REQUEST_QUESTION : QUESTIONS_BY_ID[id]
  const flagged = flaggedIds.map(toQuestion)
  const critical = criticalFlaggedIds(inspection, flaggedIds).map(toQuestion)
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

export type WeeklyCell = { stage: Stage | "none"; inspectorName: string | null }

// The stage (and who submitted it) for a single weekly-report cell —
// whichever inspection (if any) fell inside that specific day+shift window.
// `history` is already sorted newest-first, so the first match is the one
// that counts.
export function weeklyCell(
  history: InspectionRow[],
  dateKey: string,
  shiftLabel: "Day" | "Night"
): WeeklyCell {
  const window = getShiftWindowForDate(dateKey, shiftLabel)
  const match = history.find(
    (row) => row.inspection.createdAt >= window.start && row.inspection.createdAt < window.end
  )
  if (!match) return { stage: "none", inspectorName: null }
  return {
    stage: match.stage,
    inspectorName: `${match.inspection.firstName} ${match.inspection.lastName}`,
  }
}
