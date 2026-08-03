import Link from "next/link"
import InspectionFormV2 from "./InspectionFormV2"
import { QUESTIONS } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"

export default function InspectionV2Page() {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Version 2: compact chips.{" "}
        <Link href="/inspection-v1" className="underline">
          v1
        </Link>{" "}
        ·{" "}
        <Link href="/inspection" className="underline">
          v3 (current)
        </Link>
      </div>
      <InspectionFormV2
        questions={QUESTIONS}
        equipmentList={EQUIPMENT_LIST}
        today={today}
      />
    </main>
  )
}
