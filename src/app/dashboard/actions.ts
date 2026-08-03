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
import { parseReview, type ActivityEntry, type IssueStatusValue } from "@/lib/review"
import { QUESTIONS, needsAttention } from "@/lib/questions"

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

export async function lockDashboard() {
  const cookieStore = await cookies()
  cookieStore.delete(DASHBOARD_COOKIE)
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
  for (const q of QUESTIONS) {
    if (!needsAttention(answers[q.id]?.value ?? "")) continue
    const raw = formData.get(`issue_${q.id}`)
    const newVal: IssueStatusValue | null =
      raw === "in_review" || raw === "complete" ? raw : null
    if (newVal && issueStatus[q.id] !== newVal) {
      activity.push({
        id: crypto.randomUUID(),
        type: "issue",
        questionId: q.id,
        status: newVal,
        authorName,
        timestamp,
      })
      issueStatus[q.id] = newVal
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

  const stillUnresolved = QUESTIONS.some(
    (q) =>
      needsAttention(answers[q.id]?.value ?? "") &&
      issueStatus[q.id] !== "complete"
  )
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
