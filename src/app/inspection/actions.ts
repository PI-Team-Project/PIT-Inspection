"use server"

import { redirect } from "next/navigation"
import sharp from "sharp"
import { prisma } from "@/lib/prisma"
import {
  isPhotoStorageConfigured,
  photoObjectPath,
  uploadPhoto,
} from "@/lib/photoStorage"
import {
  buildRow,
  computeMaybeOpen,
  findAllOpenIssues,
  RETENTION_YEARS,
  daysPassedCount,
} from "@/app/dashboard/inspectionRow"
import { easternDateKey } from "@/lib/shifts"
import type { EquipmentType } from "@/lib/equipment"
import {
  QUESTIONS,
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

async function filesToJpegs(files: FormDataEntryValue[]): Promise<Buffer[]> {
  const photos = files.filter((f): f is File => f instanceof File && f.size > 0)
  return Promise.all(
    photos.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer())
      return sharp(buffer)
        .rotate() // applies EXIF orientation, then strips it — needed since phones rarely store photos "upright"
        .resize({
          width: MAX_PHOTO_DIMENSION,
          height: MAX_PHOTO_DIMENSION,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: PHOTO_JPEG_QUALITY })
        .toBuffer()
    })
  )
}

// Photos go to object storage, keyed by the inspection they belong to — so
// they can only be written once the row exists and has an id.
//
// Every failure here falls back to an inline data URI rather than losing
// the photo. A worker standing at a forklift must never lose an inspection
// because a bucket is unreachable or an environment variable is missing;
// the fallback costs database space, which is recoverable, instead of
// evidence, which is not.
async function storePhotos(
  inspectionId: string,
  equipmentSerial: string,
  photos: { questionId: string; order: number; jpeg: Buffer }[]
): Promise<void> {
  if (photos.length === 0) return

  const rows = await Promise.all(
    photos.map(async ({ questionId, order, jpeg }) => {
      const storagePath = isPhotoStorageConfigured()
        ? await uploadPhoto(
            photoObjectPath(equipmentSerial, inspectionId, questionId, order),
            jpeg
          )
        : null
      return {
        inspectionId,
        questionId,
        order,
        storagePath,
        dataUri: storagePath ? null : `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      }
    })
  )

  await prisma.photo.createMany({ data: rows })
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
  const photoRecords: { questionId: string; order: number; jpeg: Buffer }[] = []

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
        const [jpeg] = await filesToJpegs([file])
        photoRecords.push({ questionId: REPAIR_REQUEST_ISSUE_ID, order: i, jpeg })
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
      if (needsAttention(value)) {
        const note = String(formData.get(`${q.id}_note`) ?? "").trim()
        if (note) entry.note = note

        for (let i = 0; i < CHECKLIST_PHOTO_SLOTS; i++) {
          const file = formData.get(`${q.id}_photo_${i}`)
          if (file instanceof File && file.size > 0) {
            const [jpeg] = await filesToJpegs([file])
            photoRecords.push({ questionId: q.id, order: i, jpeg })
          }
        }
      }
      answers[q.id] = entry
    }
  }

  try {
    if (locationMatches === "No" && actualLocation) {
      // An inspector's report is a single unverified observation — it
      // becomes the trusted `location` everywhere (dashboard, Weekly
      // Report, exports) only once a supervisor approves it, not
      // immediately. Overwrites any earlier still-pending report rather
      // than stacking them; only the latest observation is worth a
      // supervisor's attention.
      await prisma.equipment.update({
        where: { serial: equipmentSerial },
        data: {
          pendingLocation: actualLocation,
          pendingLocationReportedBy: `${firstName} ${lastName}`,
          pendingLocationReportedAt: new Date(),
        },
      })
    }

    // Recorded here (not just on Equipment) so the report survives in this
    // vehicle's permanent activity trail/export even if it's later
    // dismissed rather than approved.
    const review =
      locationMatches === "No" && actualLocation
        ? {
            issueStatus: {},
            confirmedResolved: false,
            activity: [
              {
                id: crypto.randomUUID(),
                type: "location-pending",
                location: actualLocation,
                fromLocation: equipment.location,
                authorName: `${firstName} ${lastName}`,
                timestamp: new Date().toISOString(),
              },
            ],
          }
        : null

    const data = {
      type,
      date,
      shift,
      lastName,
      firstName,
      equipmentLabel: `${equipment.flNumber} — ${equipment.makeColor} (${equipment.type})`,
      equipmentSerial,
      answers,
      ...(review ? { review } : {}),
    }

    const created = await prisma.inspection.create({
      data: {
        ...data,
        // Derived from the very payload being written, via the same
        // getStage the dashboard renders from — see computeMaybeOpen.
        maybeOpen: computeMaybeOpen({ type, answers, review }),
      },
    })

    await storePhotos(created.id, equipmentSerial, photoRecords)
  } catch (err) {
    console.error("submitInspection failed:", err)
    redirect("/inspection?error=submit-failed")
  }

  redirect("/inspection/success")
}

export type VehicleAlert = {
  stage: "unresolved" | "pending-confirm"
  // Plain-language names of what's still open, e.g. ["Horn", "Brakes"].
  items: string[]
  reportedOn: string
  shift: string
  daysOpen: number
}

// Called the moment a worker picks a vehicle, so they're told BEFORE filling
// anything in that this one is carrying an unresolved report. A red vehicle
// is not supposed to be in service at all, so the person standing in front
// of it is the one who most needs to know.
//
// Scoped to the single selected vehicle on purpose: the dashboard's
// equivalent loads the whole retention window fleet-wide (~22k rows at a
// year) and that cost has no business on the worker-facing form. This hits
// the (equipmentSerial, createdAt) index for one vehicle, so it stays small
// no matter how large the table grows.
export async function vehicleOpenIssue(serial: string): Promise<VehicleAlert | null> {
  if (!serial) return null

  const equipment = await prisma.equipment.findUnique({
    where: { serial },
    select: { type: true },
  })
  if (!equipment) return null

  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - (RETENTION_YEARS[equipment.type as EquipmentType] ?? 2))

  const history = await prisma.inspection.findMany({
    where: { equipmentSerial: serial, createdAt: { gte: cutoff } },
    orderBy: { createdAt: "desc" },
  })

  const open = findAllOpenIssues(history.map(buildRow))[0]
  if (!open) return null
  if (open.stage !== "unresolved" && open.stage !== "pending-confirm") return null

  // Only the items still awaiting sign-off — one already marked complete
  // isn't what the worker needs warning about.
  const items = (open.stage === "unresolved" ? open.unresolved : open.flagged)
    .filter((q) => open.review.issueStatus[q.id] !== "complete")
    .map((q) => q.label)

  const today = easternDateKey(new Date())
  return {
    stage: open.stage,
    items: items.length > 0 ? items : open.flagged.map((q) => q.label),
    reportedOn: open.inspection.date,
    shift: open.inspection.shift,
    daysOpen: daysPassedCount(open.inspection.date, today),
  }
}
