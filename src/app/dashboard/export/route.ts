import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { buildInspectionsCsv } from "@/lib/inspectionsCsv"
import { RETENTION_YEARS, buildRow, findAllOpenIssues } from "../inspectionRow"
import { exportRangeStart, easternDateKey } from "@/lib/shifts"

type ExportRange = "all" | "week" | "month" | "custom"
type ExportScope = "all" | "open" | "resolved"

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const range = (params.get("range") ?? "all") as ExportRange
  const scope = (params.get("scope") ?? "all") as ExportScope
  const customFrom = params.get("from")
  const customTo = params.get("to")
  const isValidDateKey = (v: string | null) => Boolean(v) && /^\d{4}-\d{2}-\d{2}$/.test(v!)

  const todayKey = easternDateKey(new Date())

  // No equipment's retention window reaches back further than the longest
  // one (see RETENTION_YEARS) — without this bound, "All Time" fetches
  // every inspection ever recorded, growing unbounded forever since
  // nothing ever deletes old rows yet.
  const maxRetentionYears = Math.max(...Object.values(RETENTION_YEARS))
  const oldestPossibleCutoff = new Date()
  oldestPossibleCutoff.setFullYear(oldestPossibleCutoff.getFullYear() - maxRetentionYears)
  const retentionFloorKey = oldestPossibleCutoff.toISOString().slice(0, 10)

  const rangeStartKey = exportRangeStart(range, todayKey, customFrom) ?? retentionFloorKey
  const rangeEndKey = range === "custom" && isValidDateKey(customTo) ? customTo! : todayKey

  // Scope reflects a vehicle's OVERALL status (does it have an open issue
  // anywhere in its history, or a resolved one), not just what falls
  // inside the chosen date window — so this always needs the full
  // retention-bounded history to decide who's in scope, before the date
  // range trims down to which of THEIR rows actually get exported.
  const allInspections = await prisma.inspection.findMany({
    where: { createdAt: { gte: oldestPossibleCutoff } },
    orderBy: { createdAt: "desc" },
  })

  let allowedSerials: Set<string> | null = null
  if (scope !== "all") {
    const bySerial = new Map<string, typeof allInspections>()
    for (const inspection of allInspections) {
      const list = bySerial.get(inspection.equipmentSerial)
      if (list) list.push(inspection)
      else bySerial.set(inspection.equipmentSerial, [inspection])
    }
    allowedSerials = new Set()
    for (const [serial, list] of bySerial) {
      const history = list.map(buildRow)
      const matches =
        scope === "open"
          ? findAllOpenIssues(history).length > 0
          : history.some((row) => row.stage === "confirmed")
      if (matches) allowedSerials.add(serial)
    }
  }

  const inspections = allInspections.filter((inspection) => {
    if (inspection.date < rangeStartKey || inspection.date > rangeEndKey) return false
    if (allowedSerials && !allowedSerials.has(inspection.equipmentSerial)) return false
    return true
  })

  const csv = buildInspectionsCsv(inspections)
  const suffix = [range !== "all" ? range : null, scope !== "all" ? scope : null]
    .filter(Boolean)
    .join("-")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pit-inspections${suffix ? `-${suffix}` : ""}-${todayKey}.csv"`,
    },
  })
}
