"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import {
  DASHBOARD_COOKIE,
  MANAGER_NAME_COOKIE,
  dashboardSessionValue,
  isValidPin,
} from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { LOCATIONS } from "@/lib/equipment"
import {
  parseReview,
  flaggedIssueIds,
  type ActivityEntry,
  type IssueStatusValue,
} from "@/lib/review"

export async function unlockDashboard(formData: FormData) {
  const pin = String(formData.get("pin") ?? "")

  if (!isValidPin(pin)) {
    redirect("/dashboard?error=1")
  }

  const cookieStore = await cookies()
  cookieStore.set(DASHBOARD_COOKIE, dashboardSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
  })

  redirect("/dashboard")
}

export async function saveActivity(formData: FormData) {
  const inspectionId = String(formData.get("inspectionId") ?? "")
  const authorName = String(formData.get("reviewerName") ?? "").trim() || "Unknown"
  const timestamp = new Date().toISOString()

  const cookieStore = await cookies()
  cookieStore.set(MANAGER_NAME_COOKIE, authorName, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })

  const inspection = await prisma.inspection.findUniqueOrThrow({
    where: { id: inspectionId },
  })
  const review = parseReview(inspection.review)
  const activity: ActivityEntry[] = [...review.activity]
  const issueStatus: Record<string, IssueStatusValue> = { ...review.issueStatus }
  let changedSomething = false

  const answers = inspection.answers as Record<
    string,
    { value: string; specify?: string }
  >
  const flaggedIds = flaggedIssueIds(inspection, answers)
  for (const id of flaggedIds) {
    const raw = formData.get(`issue_${id}`)
    const newVal: IssueStatusValue | null =
      raw === "in_review" || raw === "complete" ? raw : null
    if (newVal && issueStatus[id] !== newVal) {
      activity.push({
        id: crypto.randomUUID(),
        type: "issue",
        questionId: id,
        status: newVal,
        authorName,
        timestamp,
      })
      issueStatus[id] = newVal
      changedSomething = true
    }
  }

  const noteText = String(formData.get("noteText") ?? "").trim()
  if (noteText) {
    activity.push({
      id: crypto.randomUUID(),
      type: "note",
      text: noteText,
      authorName,
      timestamp,
    })
    changedSomething = true
  }

  if (!changedSomething) {
    activity.push({
      id: crypto.randomUUID(),
      type: "viewed",
      authorName,
      timestamp,
    })
  }

  const stillUnresolved = flaggedIds.some((id) => issueStatus[id] !== "complete")
  const confirmedResolved = stillUnresolved ? false : review.confirmedResolved

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { review: { issueStatus, activity, confirmedResolved } },
  })

  revalidatePath("/dashboard")
}

export async function confirmResolved(formData: FormData) {
  const inspectionId = String(formData.get("inspectionId") ?? "")
  const authorName = String(formData.get("reviewerName") ?? "").trim() || "Unknown"
  const timestamp = new Date().toISOString()

  const cookieStore = await cookies()
  cookieStore.set(MANAGER_NAME_COOKIE, authorName, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })

  const inspection = await prisma.inspection.findUniqueOrThrow({
    where: { id: inspectionId },
  })
  const review = parseReview(inspection.review)
  const activity: ActivityEntry[] = [
    ...review.activity,
    { id: crypto.randomUUID(), type: "confirmed", authorName, timestamp },
  ]

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: {
      review: { ...review, activity, confirmedResolved: true },
    },
  })

  revalidatePath("/dashboard")
}

export async function updateEquipmentLocation(formData: FormData) {
  const serial = String(formData.get("serial") ?? "")
  const location = String(formData.get("location") ?? "")
  if (!serial || !(LOCATIONS as readonly string[]).includes(location)) return

  const cookieStore = await cookies()
  const managerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value || "Unknown"

  await prisma.equipmentLocation.upsert({
    where: { serial },
    update: { location, updatedBy: managerName },
    create: { serial, location, updatedBy: managerName },
  })

  // Log the change on the equipment's most recent inspection so it shows up
  // in the same Activity trail as notes/issue updates — there's no
  // per-equipment activity log to attach it to otherwise.
  const latest = await prisma.inspection.findFirst({
    where: { equipmentSerial: serial },
    orderBy: { createdAt: "desc" },
  })
  if (latest) {
    const review = parseReview(latest.review)
    const activity: ActivityEntry[] = [
      ...review.activity,
      {
        id: crypto.randomUUID(),
        type: "location",
        location,
        authorName: managerName,
        timestamp: new Date().toISOString(),
      },
    ]
    await prisma.inspection.update({
      where: { id: latest.id },
      data: { review: { ...review, activity } },
    })
  }

  revalidatePath("/dashboard")
  revalidatePath("/inspection")
}

export async function archiveEquipment(
  _prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const pin = String(formData.get("pin") ?? "")
  const serial = String(formData.get("serial") ?? "")

  if (!isValidPin(pin)) {
    return { error: "Incorrect PIN." }
  }

  const cookieStore = await cookies()
  const managerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value || "Unknown"

  await prisma.equipmentArchived.upsert({
    where: { serial },
    update: {},
    create: { serial, archivedBy: managerName },
  })

  revalidatePath("/dashboard")
  revalidatePath("/inspection")
  return { error: null }
}
