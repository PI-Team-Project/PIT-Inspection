import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { buildInspectionsCsv } from "@/lib/inspectionsCsv"
import { RETENTION_YEARS } from "../inspectionRow"

export async function GET() {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // No equipment's retention window reaches back further than the longest
  // one (see RETENTION_YEARS) — without this bound, this fetched every
  // inspection ever recorded on every export click, growing unbounded
  // forever since nothing ever deletes old rows yet.
  const maxRetentionYears = Math.max(...Object.values(RETENTION_YEARS))
  const oldestPossibleCutoff = new Date()
  oldestPossibleCutoff.setFullYear(oldestPossibleCutoff.getFullYear() - maxRetentionYears)

  const inspections = await prisma.inspection.findMany({
    where: { createdAt: { gte: oldestPossibleCutoff } },
    orderBy: { createdAt: "desc" },
  })

  const csv = buildInspectionsCsv(inspections)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pit-inspections-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
