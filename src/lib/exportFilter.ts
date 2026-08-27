import type { Inspection } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { RETENTION_YEARS, buildRow, findAllOpenIssues } from "@/app/dashboard/inspectionRow"
import { exportRangeStart, easternDateKey } from "@/lib/shifts"

export type ExportRange = "all" | "week" | "month" | "custom"
export type ExportScope = "all" | "open" | "resolved" | "specific"

const isValidDateKey = (v: string | null) => Boolean(v) && /^\d{4}-\d{2}-\d{2}$/.test(v!)

// Shared by the fleet-wide CSV and Excel export routes so their filtering
// (and the filename suffix that describes it) can never drift apart.
export async function fetchInspectionsForExport({
  range,
  scope,
  customFrom,
  customTo,
  serials,
}: {
  range: ExportRange
  scope: ExportScope
  customFrom: string | null
  customTo: string | null
  // Only meaningful when scope === "specific" — the exact set of vehicles
  // someone hand-picked, as opposed to "open"/"resolved" which are computed
  // from each vehicle's own history below.
  serials?: string[]
}): Promise<{ inspections: Inspection[]; todayKey: string; suffix: string }> {
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
  if (scope === "specific") {
    allowedSerials = new Set(serials ?? [])
  } else if (scope !== "all") {
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

  const suffix = [range !== "all" ? range : null, scope !== "all" ? scope : null]
    .filter(Boolean)
    .join("-")

  return { inspections, todayKey, suffix }
}
