import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { buildInspectionsCsv } from "@/lib/inspectionsCsv"
import { getEquipmentBySerial } from "@/lib/equipmentLocations"
import { easternDateKey, exportRangeStart } from "@/lib/shifts"
import { retentionCutoff } from "../../inspectionRow"

type ExportRange = "all" | "week" | "month" | "custom"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { serial } = await params

  const equipment = await getEquipmentBySerial(serial)
  if (!equipment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const searchParams = request.nextUrl.searchParams
  const range = (searchParams.get("range") ?? "all") as ExportRange
  const customFrom = searchParams.get("from")
  const customTo = searchParams.get("to")
  const isValidDateKey = (v: string | null) => Boolean(v) && /^\d{4}-\d{2}-\d{2}$/.test(v!)

  // Same per-type retention cutoff the equipment detail page and dashboard
  // already use — without it, this pulled a vehicle's ENTIRE inspection
  // history unbounded, unlike the fleet-wide export which is bounded. Uses
  // the fleet's Eastern calendar date, not the server's own UTC one — see
  // the dashboard page for why that distinction matters.
  const today = easternDateKey(new Date())
  const retentionFloorKey = retentionCutoff(equipment.type, today)

  // A chosen Date Range narrows further, but never past the retention
  // floor — "This Week" on a pallet jack still just means this week, not
  // an error, so the later of the two always wins.
  const rangeStartKey = exportRangeStart(range, today, customFrom) ?? retentionFloorKey
  const startKey = rangeStartKey > retentionFloorKey ? rangeStartKey : retentionFloorKey
  const endKey = range === "custom" && isValidDateKey(customTo) ? customTo! : today

  const inspections = await prisma.inspection.findMany({
    where: { equipmentSerial: serial, date: { gte: startKey, lte: endKey } },
    orderBy: { createdAt: "desc" },
  })

  const csv = buildInspectionsCsv(inspections)
  const suffix = range !== "all" ? `-${range}` : ""

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pit-inspection-history-${serial}${suffix}-${today}.csv"`,
    },
  })
}
