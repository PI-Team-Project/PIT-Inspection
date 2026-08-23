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

// Once an issue is flagged, it stays open until a supervisor explicitly
// signs it off — a LATER inspection simply not re-flagging the same thing
// must never silently clear it. This was a real bug: a vehicle's status
// used to come from only its single most recent inspection, so a worker's
// routine "all good" shift could erase an outstanding, never-reviewed
// safety flag from days earlier with nobody ever confirming it was fixed.
// This scans the *whole* history for the most severe still-unconfirmed
// issue — unresolved outranks pending-confirm, and ties go to whichever
// has been open longest — so the app keeps surfacing it for review no
// matter how many clean inspections happen after it, until someone
// actually signs off on that specific one.
const OPEN_SEVERITY: Record<"unresolved" | "pending-confirm", number> = {
  unresolved: 0,
  "pending-confirm": 1,
}

export function findOpenIssue<T extends { stage: Stage | "none"; inspection: { createdAt: Date } }>(
  history: T[]
): T | null {
  let openIssue: T | null = null
  for (const row of history) {
    if (row.stage !== "unresolved" && row.stage !== "pending-confirm") continue
    if (!openIssue) {
      openIssue = row
      continue
    }
    const rowRank = OPEN_SEVERITY[row.stage]
    const bestRank = OPEN_SEVERITY[openIssue.stage as "unresolved" | "pending-confirm"]
    if (rowRank < bestRank || (rowRank === bestRank && row.inspection.createdAt < openIssue.inspection.createdAt)) {
      openIssue = row
    }
  }
  return openIssue
}

// "Since" now just means "since the open issue found above" — no separate
// consecutive-run walk needed, because findOpenIssue already scans the
// full history rather than stopping at the first clean inspection.
export function badSince(
  history: { stage: Stage | "none"; inspection: { date: string; createdAt: Date } }[],
  today: string
): string | null {
  const open = findOpenIssue(history)
  return open && open.inspection.date < today ? open.inspection.date : null
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
export function weeklyCell<
  T extends { stage: Stage | "none"; inspection: { createdAt: Date; firstName: string; lastName: string } },
>(history: T[], dateKey: string, shiftLabel: "Day" | "Night"): WeeklyCell {
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
