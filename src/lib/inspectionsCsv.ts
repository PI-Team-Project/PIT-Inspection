import type { Inspection } from "@/generated/prisma/client"
import { QUESTIONS } from "@/lib/questions"
import { parseReview, getStage, criticalFlaggedIds, flaggedIssueIds } from "@/lib/review"
import { FLEET_TIME_ZONE } from "@/lib/shifts"

type Answers = Record<string, { value: string; specify?: string }>

// Raw createdAt.toISOString() reads as "2026-08-14T16:10:35.033Z" — millisecond
// precision nobody needs, in UTC, disconnected from the Date/Shift columns
// next to it (which are Eastern business-day values). This is the same
// moment, just in the timezone the sheet is already using and without the
// clutter — seconds are kept (not just minutes) since this column is also
// how near-duplicate submissions get told apart.
function formatSubmittedAt(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} ${get("dayPeriod")}`
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsvRow(cells: string[]): string {
  return cells.map(csvCell).join(",")
}

const STAGE_LABEL: Record<string, string> = {
  unresolved: "Unresolved",
  "pending-confirm": "Needs Attention",
  confirmed: "Resolved & Confirmed",
  clean: "All Good",
}

export function buildInspectionsCsv(inspections: Inspection[]): string {
  const headers = [
    "Submitted At (ET)",
    "Type",
    "Date",
    "Shift",
    "Last Name",
    "First Name",
    "Equipment",
    "Serial#",
    "Status",
    ...QUESTIONS.map((q) => `${q.number}. ${q.label}`),
    "Activity Log",
  ]

  const rows = inspections.map((inspection) => {
    const answers = inspection.answers as Answers
    const review = parseReview(inspection.review)
    const flaggedIds = flaggedIssueIds(inspection, answers)
    // BUG FIX: this used to only treat a whole Repair Request as critical,
    // never a Daily inspection's individual safety-critical flag (horn,
    // brakes, etc.) — so a Daily inspection with an unresolved
    // safety-critical answer exported as "Needs Attention" here while the
    // live dashboard correctly showed it as "Unresolved". criticalFlaggedIds
    // is the same check the dashboard/equipment page use.
    const criticalIds = criticalFlaggedIds(inspection, flaggedIds)
    const unresolvedCriticalCount = criticalIds.filter(
      (id) => review.issueStatus[id] !== "complete"
    ).length
    const allFlaggedComplete = flaggedIds.every((id) => review.issueStatus[id] === "complete")
    const stage = getStage(
      flaggedIds.length,
      unresolvedCriticalCount,
      review.confirmedResolved,
      allFlaggedComplete
    )

    const answerCells = QUESTIONS.map((q) => {
      const a = answers[q.id]
      if (!a) return ""
      return a.specify ? `${a.value} - ${a.specify}` : a.value
    })

    const activityLog = review.activity
      .map((entry) => {
        const when = new Date(entry.timestamp).toLocaleString()
        if (entry.type === "note") return `[${when}] ${entry.authorName}: ${entry.text}`
        if (entry.type === "viewed") return `[${when}] Reviewed by ${entry.authorName}`
        if (entry.type === "confirmed") return `[${when}] Confirmed all clear by ${entry.authorName}`
        if (entry.type === "location")
          return `[${when}] Location set to ${entry.location} by ${entry.authorName}`
        const q = QUESTIONS.find((x) => x.id === entry.questionId)
        const label = entry.status === "complete" ? "Complete" : "In Review"
        return `[${when}] ${q?.label ?? entry.questionId} marked ${label} by ${entry.authorName}`
      })
      .join(" | ")

    return toCsvRow([
      formatSubmittedAt(inspection.createdAt),
      inspection.type,
      inspection.date,
      inspection.shift,
      inspection.lastName,
      inspection.firstName,
      inspection.equipmentLabel,
      inspection.equipmentSerial,
      STAGE_LABEL[stage] ?? stage,
      ...answerCells,
      activityLog,
    ])
  })

  return [toCsvRow(headers), ...rows].join("\r\n")
}
