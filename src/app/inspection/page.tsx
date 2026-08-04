import InspectionForm from "./InspectionForm"
import { QUESTIONS } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"
import { getShiftForDate } from "@/lib/shifts"

export default function InspectionPage() {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <InspectionForm
        questions={QUESTIONS}
        equipmentList={EQUIPMENT_LIST}
        today={today}
        currentShift={getShiftForDate(now)}
      />
    </div>
  )
}
