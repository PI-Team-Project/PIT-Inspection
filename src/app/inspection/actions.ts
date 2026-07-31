"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { QUESTIONS, needsSpecify } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"

export async function submitInspection(formData: FormData) {
  const date = String(formData.get("date") ?? "")
  const lastName = String(formData.get("lastName") ?? "")
  const firstName = String(formData.get("firstName") ?? "")
  const equipmentSerial = String(formData.get("equipmentSerial") ?? "")
  const equipment = EQUIPMENT_LIST.find((e) => e.serial === equipmentSerial)

  const answers: Record<string, { value: string; specify?: string }> = {}
  for (const q of QUESTIONS) {
    const value = String(formData.get(q.id) ?? "")
    const entry: { value: string; specify?: string } = { value }
    if (needsSpecify(value)) {
      entry.specify = String(formData.get(`${q.id}_specify`) ?? "")
    }
    answers[q.id] = entry
  }

  await prisma.inspection.create({
    data: {
      date,
      lastName,
      firstName,
      equipmentLabel: equipment?.label ?? "",
      equipmentSerial,
      answers,
    },
  })

  redirect("/inspection/success")
}
