"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import {
  DASHBOARD_COOKIE,
  MANAGER_NAME_COOKIE,
  PIN_ATTEMPTS_COOKIE,
  dashboardSessionValue,
  isValidPin,
  getPinLockout,
  recordFailedPinAttempt,
} from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { LOCATIONS } from "@/lib/equipment"
import {
  parseReview,
  flaggedIssueIds,
  type ActivityEntry,
  type IssueStatusValue,
} from "@/lib/review"
import { getShiftWindowForDate, getCurrentShiftWindow } from "@/lib/shifts"

// Used before navigating to a historical shift — a future date, or a past
// one where nothing was ever inspected, isn't worth showing a whole page
// for, so the nav controls check first and refuse the jump instead.
export async function shiftHasData(dateKey: string, label: "Day" | "Night"): Promise<boolean> {
  const current = getCurrentShiftWindow(new Date())
  const window = getShiftWindowForDate(dateKey, label)

  if (window.start.getTime() > current.start.getTime()) return false

  // The live shift always "has data" to show (even if it's 0/34 so far) —
  // only completed, historical shifts need an actual inspection on record
  // to justify the jump.
  if (window.start.getTime() === current.start.getTime()) return true

  const count = await prisma.inspection.count({
    where: { createdAt: { gte: window.start, lt: window.end } },
  })
  return count > 0
}

export async function unlockDashboard(formData: FormData) {
  const pin = String(formData.get("pin") ?? "")
  const cookieStore = await cookies()

  const existingLockout = getPinLockout(cookieStore.get(PIN_ATTEMPTS_COOKIE)?.value)
  if (existingLockout) {
    const minutes = Math.ceil((existingLockout.lockedUntil - Date.now()) / 60000)
    redirect(`/dashboard?error=locked&minutes=${minutes}`)
  }

  if (!isValidPin(pin)) {
    const { cookieValue, lockedUntil } = recordFailedPinAttempt(
      cookieStore.get(PIN_ATTEMPTS_COOKIE)?.value
    )
    cookieStore.set(PIN_ATTEMPTS_COOKIE, cookieValue, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60,
    })
    if (lockedUntil) {
      const minutes = Math.ceil((lockedUntil - Date.now()) / 60000)
      redirect(`/dashboard?error=locked&minutes=${minutes}`)
    }
    redirect("/dashboard?error=1")
  }

  cookieStore.delete(PIN_ATTEMPTS_COOKIE)
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
    // Rendered as a single "Mark Complete" checkbox, not a pair of radios —
    // an unchecked box sends no field at all, which means "in review".
    const newVal: IssueStatusValue = formData.get(`issue_${id}`) === "complete"
      ? "complete"
      : "in_review"
    if (issueStatus[id] !== newVal) {
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

  // Marking every flagged item Complete now confirms all-clear in this same
  // submission — a supervisor doing both in one visit no longer has to come
  // back for a second, separate confirmation step.
  const stillUnresolved = flaggedIds.some((id) => issueStatus[id] !== "complete")
  const confirmedResolved = !stillUnresolved
  if (confirmedResolved && !review.confirmedResolved) {
    activity.push({ id: crypto.randomUUID(), type: "confirmed", authorName, timestamp })
  }

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { review: { issueStatus, activity, confirmedResolved } },
  })

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/equipment/[serial]", "page")
}

export async function updateEquipmentLocation(
  _prevState: null,
  formData: FormData
): Promise<null> {
  const serial = String(formData.get("serial") ?? "")
  const location = String(formData.get("location") ?? "")
  const managerName = String(formData.get("managerName") ?? "").trim() || "Unknown"
  if (!serial || !(LOCATIONS as readonly string[]).includes(location)) return null

  const cookieStore = await cookies()
  cookieStore.set(MANAGER_NAME_COOKIE, managerName, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })

  await prisma.equipment.update({
    where: { serial },
    data: { location },
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
  revalidatePath("/dashboard/equipment/[serial]", "page")
  revalidatePath("/inspection")
  return null
}

