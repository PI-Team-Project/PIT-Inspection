"use server"

import { redirect } from "next/navigation"
import sharp from "sharp"
import { prisma } from "@/lib/prisma"
import {
  QUESTIONS,
  needsSpecify,
  needsAttention,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_PHOTO_SLOTS,
  CHECKLIST_PHOTO_SLOTS,
} from "@/lib/questions"

// Phone camera photos arrive at full sensor resolution (several MB each) —
// nothing worth inspecting on a forklift needs more than this. Re-encoding
// every photo to a capped, compressed JPEG here (not just HEIC ones) is what
// keeps the Photo table from growing 20-80x faster than testing suggested.
const MAX_PHOTO_DIMENSION = 1600
const PHOTO_JPEG_QUALITY = 72

async function filesToDataUris(files: FormDataEntryValue[]): Promise<string[]> {
  const photos = files.filter((f): f is File => f instanceof File && f.size > 0)
  return Promise.all(
    photos.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer())
      const compressed = await sharp(buffer)
        .rotate() // applies EXIF orientation, then strips it — needed since phones rarely store photos "upright"
        .resize({
          width: MAX_PHOTO_DIMENSION,
          height: MAX_PHOTO_DIMENSION,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: PHOTO_JPEG_QUALITY })
        .toBuffer()
      return `data:image/jpeg;base64,${compressed.toString("base64")}`
    })
  )
}

export async function submitInspection(formData: FormData) {
  const type = String(formData.get("inspectionType") ?? "Daily Inspection") === "Repair Request"
    ? "Repair Request"
    : "Daily"
  const date = String(formData.get("date") ?? "").trim()
  const shift = String(formData.get("shift") ?? "").trim()
  const lastName = String(formData.get("lastName") ?? "").trim()
  const firstName = String(formData.get("firstName") ?? "").trim()
  const equipmentSerial = String(formData.get("equipmentSerial") ?? "").trim()

  // Client-side `required` is the only gate otherwise — a flaky autofill,
  // JS-disabled client, or hand-crafted request would otherwise write a
  // permanently blank-name/date/equipment row with no way to trace it back.
  if (!date || !lastName || !firstName || !equipmentSerial) {
    redirect("/inspection?error=missing-fields")
  }

  const equipment = await prisma.equipment.findUnique({ where: { serial: equipmentSerial } })
  if (!equipment) {
    redirect("/inspection?error=unknown-equipment")
  }
  if (equipment.retiredAt) {
    // Can happen if a supervisor retires this vehicle in Manage Vehicles
    // while a worker already has its inspection form open.
    redirect("/inspection?error=equipment-retired")
  }

  const answers: Record<
    string,
    {
      value: string
      specify?: string
      note?: string
    }
  > = {}

  // Photos live in their own table (see Photo model) so the dashboard's
  // fleet-wide query never has to pull base64 bytes just to compute flags —
  // collected flat here and attached via a single nested create below.
  const photoRecords: { questionId: string; order: number; dataUri: string; note?: string }[] = []

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

  if (type === "Repair Request") {
    // No checklist here — just the description and photos the reporter
    // gave, stored as a single always-flagged issue. Each photo slot has
    // its own input (not a shared name) so its note lines up by index even
    // when earlier slots were left empty.
    const description = String(formData.get("repairDescription") ?? "").trim()
    for (let i = 0; i < REPAIR_REQUEST_PHOTO_SLOTS; i++) {
      const file = formData.get(`repairRequest_photo_${i}`)
      if (file instanceof File && file.size > 0) {
        const [uri] = await filesToDataUris([file])
        const note = String(formData.get(`repairRequest_photo_note_${i}`) ?? "").trim()
        photoRecords.push({
          questionId: REPAIR_REQUEST_ISSUE_ID,
          order: i,
          dataUri: uri,
          ...(note ? { note } : {}),
        })
      }
    }
    answers[REPAIR_REQUEST_ISSUE_ID] = {
      value: "Reported",
      note: description,
    }
  } else {
    for (const q of QUESTIONS) {
      const value = String(formData.get(q.id) ?? "")
      const entry: {
        value: string
        specify?: string
        note?: string
      } = { value }
      if (needsSpecify(value)) {
        entry.specify = String(formData.get(`${q.id}_specify`) ?? "")
      }
      if (needsAttention(value)) {
        const note = String(formData.get(`${q.id}_note`) ?? "").trim()
        if (note) entry.note = note

        for (let i = 0; i < CHECKLIST_PHOTO_SLOTS; i++) {
          const file = formData.get(`${q.id}_photo_${i}`)
          if (file instanceof File && file.size > 0) {
            const [uri] = await filesToDataUris([file])
            const photoNote = String(formData.get(`${q.id}_photo_note_${i}`) ?? "").trim()
            photoRecords.push({
              questionId: q.id,
              order: i,
              dataUri: uri,
              ...(photoNote ? { note: photoNote } : {}),
            })
          }
        }
      }
      answers[q.id] = entry
    }
  }

  try {
    if (locationMatches === "No" && actualLocation) {
      // Persists so every future inspection (and the dashboard) shows this
      // as the equipment's current location instead of repeating the same
      // "wrong" default every time.
      await prisma.equipment.update({
        where: { serial: equipmentSerial },
        data: { location: actualLocation },
      })
    }

    await prisma.inspection.create({
      data: {
        type,
        date,
        shift,
        lastName,
        firstName,
        equipmentLabel: `${equipment.flNumber} — ${equipment.makeColor} (${equipment.type})`,
        equipmentSerial,
        answers,
        photos: { create: photoRecords },
      },
    })
  } catch (err) {
    console.error("submitInspection failed:", err)
    redirect("/inspection?error=submit-failed")
  }

  redirect("/inspection/success")
}
