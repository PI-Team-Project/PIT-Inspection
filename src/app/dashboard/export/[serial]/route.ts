import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { buildInspectionsCsv } from "@/lib/inspectionsCsv"

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

  const inspections = await prisma.inspection.findMany({
    where: { equipmentSerial: serial },
    orderBy: { createdAt: "desc" },
  })

  const csv = buildInspectionsCsv(inspections)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pit-inspection-history-${serial}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
