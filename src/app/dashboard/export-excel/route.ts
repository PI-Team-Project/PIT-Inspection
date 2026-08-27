import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { buildInspectionsExcel } from "@/lib/inspectionsExcel"
import { fetchInspectionsForExport, type ExportRange, type ExportScope } from "@/lib/exportFilter"

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
  const serials = params.get("serials")?.split(",").filter(Boolean)

  const { inspections, todayKey, suffix } = await fetchInspectionsForExport({
    range,
    scope,
    customFrom,
    customTo,
    serials,
  })

  const buffer = await buildInspectionsExcel(inspections)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pit-inspections${suffix ? `-${suffix}` : ""}-${todayKey}.xlsx"`,
    },
  })
}
