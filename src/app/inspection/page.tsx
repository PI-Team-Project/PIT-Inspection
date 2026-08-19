import InspectionForm from "./InspectionForm"
import { QUESTIONS } from "@/lib/questions"
import { getActiveEquipmentList } from "@/lib/equipmentLocations"
import { prisma } from "@/lib/prisma"
import { getCurrentShiftWindow, FLEET_TIME_ZONE } from "@/lib/shifts"

// Location overrides change at runtime (someone reports a correction), so
// this can't be statically prerendered — it has to re-fetch on every visit
// or new corrections would never show up until the next deploy.
export const dynamic = "force-dynamic"

export default async function InspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date()
  const shiftWindow = getCurrentShiftWindow(now)

  const [equipmentList, thisShiftInspections] = await Promise.all([
    getActiveEquipmentList(),
    prisma.inspection.findMany({
      where: { createdAt: { gte: shiftWindow.start, lt: shiftWindow.end } },
      orderBy: { createdAt: "desc" },
      select: { equipmentSerial: true, firstName: true, lastName: true, createdAt: true },
    }),
  ])

  // There's no login, so this is a heads-up rather than a hard block —
  // lets a second inspector notice someone already covered this vehicle
  // this shift instead of silently duplicating the work.
  const alreadyInspectedThisShift: Record<string, { by: string; when: string }> = {}
  for (const insp of thisShiftInspections) {
    if (alreadyInspectedThisShift[insp.equipmentSerial]) continue
    const dateTime = new Intl.DateTimeFormat("en-US", {
      timeZone: FLEET_TIME_ZONE,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(insp.createdAt)
    alreadyInspectedThisShift[insp.equipmentSerial] = {
      by: `${insp.firstName} ${insp.lastName}`.trim() || "Unknown",
      when: `${shiftWindow.label} Shift, ${dateTime}`,
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col">
      <InspectionForm
        questions={QUESTIONS}
        equipmentList={equipmentList}
        today={today}
        alreadyInspectedThisShift={alreadyInspectedThisShift}
        initialError={error}
      />
    </div>
  )
}
