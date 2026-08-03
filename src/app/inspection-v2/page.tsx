import Link from "next/link"
import InspectionFormV2 from "./InspectionFormV2"
import { QUESTIONS } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"

export default function InspectionV2Page() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Prototype — Version 2: compact chips.{" "}
        <Link href="/inspection" className="underline">
          v1
        </Link>{" "}
        ·{" "}
        <Link href="/inspection-v3" className="underline">
          v3
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900">PIT Inspection</h1>
      <p className="mt-1 mb-6 text-sm text-gray-600">
        Inspection must be completed at beginning of every shift to ensure
        equipment is good condition to use.
      </p>
      <InspectionFormV2
        questions={QUESTIONS}
        equipmentList={EQUIPMENT_LIST}
        today={today}
      />
    </main>
  )
}
