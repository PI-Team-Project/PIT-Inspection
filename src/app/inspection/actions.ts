"use server"

import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import {
  QUESTIONS,
  needsSpecify,
  needsAttention,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_PHOTO_SLOTS,
  CHECKLIST_PHOTO_SLOTS,
} from "@/lib/questions"
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
  const type = String(formData.get("inspectionType") ?? "Daily Inspection") === "Repair Request"
    ? "Repair Request"
    : "Daily"
  const date = String(formData.get("date") ?? "")
  const shift = String(formData.get("shift") ?? "")
  const lastName = String(formData.get("lastName") ?? "")
  const firstName = String(formData.get("firstName") ?? "")
  const equipmentSerial = String(formData.get("equipmentSerial") ?? "")
  const equipment = EQUIPMENT_LIST.find((e) => e.serial === equipmentSerial)

  const answers: Record<
    string,
    {
      value: string
      specify?: string
      note?: string
      photos?: string[]
      photoNotes?: string[]
    }
  > = {}

  // Shared by both flows — location drifts occasionally, so this is asked
  // right after equipment selection regardless of Daily vs. Repair Request.
  const locationMatches = String(formData.get("locationMatches") ?? "")
  const actualLocation = String(formData.get("actualLocation") ?? "").trim()
  if (locationMatches) {
    answers.locationCheck = {
      value: locationMatches,
      ...(locationMatches === "No" && actualLocation ? { specify: actualLocation } : {}),
    }
  }
  if (locationMatches === "No" && actualLocation && equipmentSerial) {
    // Persists so every future inspection (and the dashboard) shows this as
    // the equipment's current location instead of repeating the same
    // "wrong" default from EQUIPMENT_LIST every time.
    await prisma.equipmentLocation.upsert({
      where: { serial: equipmentSerial },
      update: { location: actualLocation, updatedBy: `${firstName} ${lastName}`.trim() },
      create: { serial: equipmentSerial, location: actualLocation, updatedBy: `${firstName} ${lastName}`.trim() },
    })
  }

  if (type === "Repair Request") {
    // No checklist here — just the description and photos the reporter
    // gave, stored as a single always-flagged issue. Each photo slot has
    // its own input (not a shared name) so its note lines up by index even
    // when earlier slots were left empty.
    const description = String(formData.get("repairDescription") ?? "").trim()
    const photos: string[] = []
    const photoNotes: string[] = []
    for (let i = 0; i < REPAIR_REQUEST_PHOTO_SLOTS; i++) {
      const file = formData.get(`repairRequest_photo_${i}`)
      if (file instanceof File && file.size > 0) {
        const [uri] = await filesToDataUris([file])
        photos.push(uri)
        photoNotes.push(String(formData.get(`repairRequest_photo_note_${i}`) ?? "").trim())
      }
    }
    answers[REPAIR_REQUEST_ISSUE_ID] = {
      value: "Reported",
      note: description,
      photos,
      ...(photoNotes.some(Boolean) ? { photoNotes } : {}),
    }
  } else {
    for (const q of QUESTIONS) {
      const value = String(formData.get(q.id) ?? "")
      const entry: {
        value: string
        specify?: string
        note?: string
        photos?: string[]
        photoNotes?: string[]
      } = { value }
      if (needsSpecify(value)) {
        entry.specify = String(formData.get(`${q.id}_specify`) ?? "")
      }
      if (needsAttention(value)) {
        const note = String(formData.get(`${q.id}_note`) ?? "").trim()
        if (note) entry.note = note

        const photos: string[] = []
        const photoNotes: string[] = []
        for (let i = 0; i < CHECKLIST_PHOTO_SLOTS; i++) {
          const file = formData.get(`${q.id}_photo_${i}`)
          if (file instanceof File && file.size > 0) {
            const [uri] = await filesToDataUris([file])
            photos.push(uri)
            photoNotes.push(String(formData.get(`${q.id}_photo_note_${i}`) ?? "").trim())
          }
        }
        if (photos.length > 0) entry.photos = photos
        if (photoNotes.some(Boolean)) entry.photoNotes = photoNotes
      }
      answers[q.id] = entry
    }
  }

  await prisma.inspection.create({
    data: {
      type,
      date,
      shift,
      lastName,
      firstName,
      equipmentLabel: equipment
        ? `${equipment.flNumber} — ${equipment.makeColor} (${equipment.type})`
        : "",
      equipmentSerial,
      answers,
    },
  })

  redirect("/inspection/success")
}
