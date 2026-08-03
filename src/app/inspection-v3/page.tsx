import Link from "next/link"
import InspectionFormV3 from "./InspectionFormV3"
import { QUESTIONS } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"

export default function InspectionV3Page() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <div className="mx-4 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Prototype — Version 3: one question per screen.{" "}
        <Link href="/inspection" className="underline">
          v1
        </Link>{" "}
        ·{" "}
        <Link href="/inspection-v2" className="underline">
          v2
        </Link>
      </div>
      <InspectionFormV3
        questions={QUESTIONS}
        equipmentList={EQUIPMENT_LIST}
        today={today}
      />
    </div>
  )
}
