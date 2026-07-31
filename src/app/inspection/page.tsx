import InspectionForm from "./InspectionForm"
import { QUESTIONS } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"

export default function InspectionPage() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">PIT Inspection</h1>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        Inspection must be completed at beginning of every shift to ensure
        equipment is good condition to use.
      </p>
      <InspectionForm
        questions={QUESTIONS}
        equipmentList={EQUIPMENT_LIST}
        today={today}
      />
    </main>
  )
}
