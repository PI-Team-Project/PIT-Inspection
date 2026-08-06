import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { QUESTIONS } from "@/lib/questions"
import { parseReview, getStage, isCriticalInspection, flaggedIssueIds } from "@/lib/review"

type Answers = Record<string, { value: string; specify?: string }>

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

export async function GET() {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const inspections = await prisma.inspection.findMany({
    orderBy: { createdAt: "desc" },
  })

  const headers = [
    "Submitted At",
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
    const criticalIds = isCriticalInspection(inspection) ? flaggedIds : []
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
      inspection.createdAt.toISOString(),
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

  const csv = [toCsvRow(headers), ...rows].join("\r\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pit-inspections-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
