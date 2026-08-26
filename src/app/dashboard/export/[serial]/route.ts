import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { buildInspectionsCsv } from "@/lib/inspectionsCsv"
import { getEquipmentBySerial } from "@/lib/equipmentLocations"
import { easternDateKey } from "@/lib/shifts"
import { retentionCutoff } from "../../inspectionRow"

export async function GET(
  _request: Request,
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

  // Same per-type retention cutoff the equipment detail page and dashboard
  // already use — without it, this pulled a vehicle's ENTIRE inspection
  // history unbounded, unlike the fleet-wide export which is bounded. Uses
  // the fleet's Eastern calendar date, not the server's own UTC one — see
  // the dashboard page for why that distinction matters.
  const today = easternDateKey(new Date())
  const cutoff = retentionCutoff(equipment.type, today)

  const inspections = await prisma.inspection.findMany({
    where: { equipmentSerial: serial, date: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
  })

  const csv = buildInspectionsCsv(inspections)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pit-inspection-history-${serial}-${today}.csv"`,
    },
  })
}
