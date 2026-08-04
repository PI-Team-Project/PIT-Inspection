"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { QUESTIONS, needsSpecify, needsAttention } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"

async function filesToDataUris(files: FormDataEntryValue[]): Promise<string[]> {
  const photos = files.filter((f): f is File => f instanceof File && f.size > 0)
  return Promise.all(
    photos.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer())
      return `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`
    })
  )
}

export async function submitInspection(formData: FormData) {
  const date = String(formData.get("date") ?? "")
  const shift = String(formData.get("shift") ?? "")
  const lastName = String(formData.get("lastName") ?? "")
  const firstName = String(formData.get("firstName") ?? "")
  const equipmentSerial = String(formData.get("equipmentSerial") ?? "")
  const equipment = EQUIPMENT_LIST.find((e) => e.serial === equipmentSerial)

  const answers: Record<
    string,
    { value: string; specify?: string; note?: string; photos?: string[] }
  > = {}
  for (const q of QUESTIONS) {
    const value = String(formData.get(q.id) ?? "")
    const entry: { value: string; specify?: string; note?: string; photos?: string[] } = {
      value,
    }
    if (needsSpecify(value)) {
      entry.specify = String(formData.get(`${q.id}_specify`) ?? "")
    }
    if (needsAttention(value)) {
      const note = String(formData.get(`${q.id}_note`) ?? "").trim()
      if (note) entry.note = note

      const photos = await filesToDataUris(formData.getAll(`${q.id}_photo`))
      if (photos.length > 0) entry.photos = photos
    }
    answers[q.id] = entry
  }

  await prisma.inspection.create({
    data: {
      date,
      shift,
      lastName,
      firstName,
      equipmentLabel: equipment?.label ?? "",
      equipmentSerial,
      answers,
    },
  })

  redirect("/inspection/success")
}
