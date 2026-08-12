import InspectionForm from "./InspectionForm"
import { QUESTIONS } from "@/lib/questions"
import { getActiveEquipmentList } from "@/lib/equipmentLocations"

// Location overrides change at runtime (someone reports a correction), so
// this can't be statically prerendered — it has to re-fetch on every visit
// or new corrections would never show up until the next deploy.
export const dynamic = "force-dynamic"

export default async function InspectionPage() {
  const today = new Date().toISOString().slice(0, 10)
  const equipmentList = await getActiveEquipmentList()

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col">
      <InspectionForm
        questions={QUESTIONS}
        equipmentList={equipmentList}
        today={today}
      />
    </div>
  )
}
