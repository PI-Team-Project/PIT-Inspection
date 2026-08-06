import InspectionForm from "./InspectionForm"
import { QUESTIONS } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"

export default function InspectionPage() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col">
      <InspectionForm
        questions={QUESTIONS}
        equipmentList={EQUIPMENT_LIST}
        today={today}
      />
    </div>
  )
}
