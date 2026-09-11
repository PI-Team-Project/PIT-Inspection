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
// `src` is whatever the browser should load for that photo — a signed
// Storage URL, or the legacy inline data URI for rows written before the
// move to object storage. Resolving which is the caller's job
// (resolvePhotoSources), so nothing here has to know where bytes live.
export type ResolvedPhoto = {
  questionId: string
  order: number
  src: string
  note: string | null
}

type RawInspection = Awaited<ReturnType<typeof prisma.inspection.findMany>>[number] & {
  photos?: ResolvedPhoto[]
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
        photos: list.map((p) => p.src),
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

// The one place Inspection.maybeOpen is decided. Runs getStage through
// buildRow rather than re-deriving anything, so the column can never
// disagree with the rules the rest of the app renders from — add a
// question or change what counts as a good answer and this follows
// automatically. Every write path that touches answers or review calls
// this; see the column's own comment in schema.prisma for why it exists.
export function computeMaybeOpen(
  inspection: Pick<RawInspection, "type" | "answers" | "review">
): boolean {
  // Stage depends on exactly these three fields, so callers pass only
  // those. buildRow wants a whole row and reads none of the rest, so the
  // filler lives here in one documented place rather than at every call
  // site — and buildRow stays the only thing that knows how a stage is
  // derived.
  const { stage } = buildRow({
    ...inspection,
    id: "",
    createdAt: new Date(),
    date: "",
    shift: "",
    lastName: "",
    firstName: "",
    equipmentLabel: "",
    equipmentSerial: "",
    maybeOpen: false,
  })
  return stage === "unresolved" || stage === "pending-confirm"
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
  return findAllOpenIssues(history)[0] ?? null
}

// Same scan as findOpenIssue, but returns every still-open inspection, not
// just the worst one. A vehicle can accumulate more than one of these
// independently (e.g. two separate Repair Requests days apart) — confirming
// the newer one doesn't touch the older one, so a manager who only sees "the"
// open issue can walk away thinking the vehicle is fully clear when it isn't.
// Worst/oldest first, same ordering findOpenIssue already used.
export function findAllOpenIssues<
  T extends { stage: Stage | "none"; inspection: { createdAt: Date } },
>(history: T[]): T[] {
  return history
    .filter((row): row is T & { stage: "unresolved" | "pending-confirm" } =>
      row.stage === "unresolved" || row.stage === "pending-confirm"
    )
    .sort((a, b) => {
      const rankDiff = OPEN_SEVERITY[a.stage] - OPEN_SEVERITY[b.stage]
      if (rankDiff !== 0) return rankDiff
      return a.inspection.createdAt.getTime() - b.inspection.createdAt.getTime()
    })
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
// INTERIM, pending a compliance decision. These were 2 years for forklifts
// and 5 for pallet jacks, with nothing in the code or the history explaining
// why a pallet jack's records should outlive a forklift's — and nobody who
// chose either number. A live cron deletes on this schedule permanently, so
// the shorter window was the riskier guess: deleting a safety record too
// early cannot be undone, while keeping one too long now costs almost
// nothing (photos live in object storage, so a year of records is ~15MB).
//
// Levelled at 5 years until someone confirms what OSHA, the insurer, or LX
// Pantos policy actually require for daily PIT inspections. If the answer
// turns out to be longer, raise it before the first deletion fires — the
// oldest record today is from 2025, so nothing is near any cutoff yet.
export const RETENTION_YEARS: Record<EquipmentType, number> = {
  "Sit Down": 5,
  Propane: 5,
  Standup: 5,
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

// The newest inspection for each vehicle, as one Postgres DISTINCT ON.
//
// Prisma's own `distinct` looks like this but is applied in memory after
// the rows arrive: asking it for 34 latest rows pulled all 22,340 and threw
// away the rest, costing 1.3s — the single slowest thing on the dashboard.
// The same query written as real SQL walks the (equipmentSerial, createdAt)
// index and returns in ~75ms.
//
// Raw SQL is safe here in a way it would not be for stage: this only
// chooses WHICH rows to return, so no business rule is being restated. The
// shape matches what findMany({ include: { _count: ... } }) produces, so
// buildRow and every consumer are unaffected.
export async function latestInspectionPerVehicle(
  createdSince: Date
): Promise<(RawInspection & { _count: { photos: number } })[]> {
  const rows = await prisma.$queryRaw<
    (Omit<RawInspection, "_count"> & { photo_count: number })[]
  >`
    SELECT DISTINCT ON (i."equipmentSerial") i.*,
           (SELECT count(*) FROM "Photo" p WHERE p."inspectionId" = i.id)::int AS photo_count
    FROM "Inspection" i
    WHERE i."createdAt" >= ${createdSince}
    ORDER BY i."equipmentSerial", i."createdAt" DESC
  `
  return rows.map(({ photo_count, ...inspection }) => ({
    ...(inspection as RawInspection),
    _count: { photos: photo_count },
  }))
}
