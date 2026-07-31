"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { DASHBOARD_COOKIE, dashboardSessionValue, isValidPin } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { Review } from "@/lib/review"

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

export async function saveReview(formData: FormData) {
  const inspectionId = String(formData.get("inspectionId") ?? "")
  const acknowledged = formData.get("acknowledged") === "on"
  const notes = String(formData.get("notes") ?? "")

  const issueStatus: Record<string, boolean> = {}
  for (const key of formData.keys()) {
    if (key.startsWith("issue_")) {
      issueStatus[key.slice("issue_".length)] = formData.get(key) === "on"
    }
  }

  const review: Review = { acknowledged, notes, issueStatus }

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { review },
  })

  revalidatePath("/dashboard")
}
