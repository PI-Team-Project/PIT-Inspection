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

  // "open" and "resolved" describe a vehicle's OVERALL status, so they are
  // the only scopes that need its whole history — every other export used
  // to pay that cost too, reading the entire retention window and then
  // discarding most of it in JS, which made a one-week export cost exactly
  // what an all-time one did (~22k rows, 1.4s at a year of data).
  //
  // Each branch now reads exactly once. Splitting them also keeps the
  // stage rules in one place: which vehicles qualify still comes from
  // getStage via buildRow, never from a second copy of those rules in SQL.
  if (scope === "open" || scope === "resolved") {
    const history = await prisma.inspection.findMany({
      where: { createdAt: { gte: oldestPossibleCutoff } },
      orderBy: { createdAt: "desc" },
    })

    const bySerial = new Map<string, typeof history>()
    for (const inspection of history) {
      const list = bySerial.get(inspection.equipmentSerial)
      if (list) list.push(inspection)
      else bySerial.set(inspection.equipmentSerial, [inspection])
    }

    const allowed = new Set<string>()
    for (const [serial, list] of bySerial) {
      const rows = list.map(buildRow)
      const matches =
        scope === "open"
          ? findAllOpenIssues(rows).length > 0
          : rows.some((row) => row.stage === "confirmed")
      if (matches) allowed.add(serial)
    }

    const inspections = history.filter(
      (i) =>
        i.date >= rangeStartKey && i.date <= rangeEndKey && allowed.has(i.equipmentSerial)
    )
    return { inspections, todayKey, suffix: buildSuffix(range, scope) }
  }

  // "all" and "specific" are pure row filters, so the database can do all
  // of it — no history scan, no post-filtering.
  const inspections = await prisma.inspection.findMany({
    where: {
      createdAt: { gte: oldestPossibleCutoff },
      date: { gte: rangeStartKey, lte: rangeEndKey },
      ...(scope === "specific" ? { equipmentSerial: { in: serials ?? [] } } : {}),
    },
    orderBy: { createdAt: "desc" },
  })

  return { inspections, todayKey, suffix: buildSuffix(range, scope) }
}

function buildSuffix(range: ExportRange, scope: ExportScope): string {
  return [range !== "all" ? range : null, scope !== "all" ? scope : null]
    .filter(Boolean)
    .join("-")
}
