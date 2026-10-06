"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import {
  DASHBOARD_COOKIE,
  MANAGER_NAME_COOKIE,
  newDashboardSessionToken,
  requireDashboardSession,
} from "@/lib/auth"
import { SESSION_TTL_MS } from "@/lib/session"
import { clearLoginFailures, clientKey, loginLockedMinutes, recordLoginFailure } from "@/lib/loginThrottle"
import { verifyPin, setDashboardPin } from "@/lib/dashboardPin"
import { prisma } from "@/lib/prisma"
import { computeMaybeOpen } from "@/app/dashboard/inspectionRow"
import { LOCATIONS } from "@/lib/equipment"
import { recordSupervisor } from "@/lib/supervisorRoster"
import { normalizeSupervisorName } from "@/lib/supervisors"
import {
  parseReview,
  flaggedIssueIds,
  cascadeIssueComplete,
  type ActivityEntry,
  type IssueStatusValue,
} from "@/lib/review"

export async function unlockDashboard(formData: FormData) {
  const pin = String(formData.get("pin") ?? "")
  const headerStore = await headers()
  // Vercel sets x-real-ip / x-forwarded-for from the actual connection.
  const ip =
    headerStore.get("x-real-ip") ?? headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const throttleKey = clientKey(ip)

  const lockedMinutes = await loginLockedMinutes(throttleKey)
  if (lockedMinutes !== null) redirect(`/dashboard?error=locked&minutes=${lockedMinutes}`)

  if (!(await verifyPin(pin))) {
    await recordLoginFailure(throttleKey)
    const nowLocked = await loginLockedMinutes(throttleKey)
    redirect(nowLocked !== null ? `/dashboard?error=locked&minutes=${nowLocked}` : "/dashboard?error=1")
  }

  await clearLoginFailures(throttleKey)
  await setSessionCookie()
  redirect("/dashboard")
}

async function setSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.set(DASHBOARD_COOKIE, await newDashboardSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export type ChangePinState = { error: string | null; ok: boolean }

// Change the manager PIN from the dashboard. Verifies the current PIN, then
// stores the new one (scrypt) and a new session secret, which signs every
// other session out. The manager making the change gets a fresh cookie.
export async function changeDashboardPin(
  _prevState: ChangePinState,
  formData: FormData
): Promise<ChangePinState> {
  await requireDashboardSession()

  const current = String(formData.get("currentPin") ?? "")
  const next = String(formData.get("newPin") ?? "")
  const confirm = String(formData.get("confirmPin") ?? "")

  if (!(await verifyPin(current))) {
    return { error: "Current PIN is incorrect.", ok: false }
  }
  if (!/^\d{6}$/.test(next)) {
    return { error: "New PIN must be exactly 6 digits.", ok: false }
  }
  if (next !== confirm) {
    return { error: "New PIN and confirmation don't match.", ok: false }
  }
  if (next === current) {
    return { error: "New PIN must be different from the current one.", ok: false }
  }

  try {
    await setDashboardPin(next)
  } catch {
    return { error: "Could not save the new PIN. Please try again.", ok: false }
  }
  // The PIN change replaced the session secret, signing everyone out;
  // keep the manager who made the change signed in.
  await setSessionCookie()
  return { error: null, ok: true }
}

export async function saveActivity(formData: FormData) {
  await requireDashboardSession()
  const inspectionId = String(formData.get("inspectionId") ?? "")
  const authorName = normalizeSupervisorName(String(formData.get("reviewerName") ?? "")) || "Unknown"
  const timestamp = new Date().toISOString()

  const cookieStore = await cookies()
  cookieStore.set(MANAGER_NAME_COOKIE, authorName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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

  const review_ = { issueStatus, activity, confirmedResolved }

  // Every issue Fixed on this inspection also closes the same issue on this
  // vehicle's earlier, still-open inspections (see cascadeIssueComplete).
  // maybeOpen: false rows have nothing open, so only the rest are read.
  const completedIds = flaggedIds.filter((id) => issueStatus[id] === "complete")
  const earlierOpen = completedIds.length
    ? await prisma.inspection.findMany({
        where: {
          equipmentSerial: inspection.equipmentSerial,
          maybeOpen: true,
          createdAt: { lt: inspection.createdAt },
          id: { not: inspection.id },
        },
      })
    : []
  const cascaded = earlierOpen.flatMap((earlier) => {
    const next = cascadeIssueComplete(
      {
        type: earlier.type,
        answers: earlier.answers as Record<string, { value: string }>,
        review: parseReview(earlier.review),
      },
      completedIds,
      {
        authorName,
        timestamp,
        appliedFrom: { inspectionId, date: inspection.date, shift: inspection.shift },
      }
    )
    return next ? [{ earlier, review: next }] : []
  })

  // One transaction: the fix and everything it closes land together or not
  // at all. These are the only writes in the app that can close an issue,
  // so the only ones that have to recompute maybeOpen — derived from the
  // review being written, through the same getStage the dashboard uses.
  await prisma.$transaction([
    prisma.inspection.update({
      where: { id: inspectionId },
      data: {
        review: review_,
        maybeOpen: computeMaybeOpen({
          type: inspection.type,
          answers: inspection.answers,
          review: review_,
        }),
      },
    }),
    ...cascaded.map(({ earlier, review }) =>
      prisma.inspection.update({
        where: { id: earlier.id },
        data: {
          review,
          maybeOpen: computeMaybeOpen({ type: earlier.type, answers: earlier.answers, review }),
        },
      })
    ),
  ])
  await recordSupervisor(authorName)

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/equipment/[serial]", "page")
}

export async function updateEquipmentLocation(
  _prevState: null,
  formData: FormData
): Promise<null> {
  await requireDashboardSession()
  const serial = String(formData.get("serial") ?? "")
  const location = String(formData.get("location") ?? "")
  const managerName = String(formData.get("managerName") ?? "").trim() || "Unknown"
  if (!serial || !(LOCATIONS as readonly string[]).includes(location)) return null

  const cookieStore = await cookies()
  cookieStore.set(MANAGER_NAME_COOKIE, managerName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })

  // Read before overwriting — this is the only chance to know what the
  // location is changing FROM, needed for the Activity trail's "from X to
  // Y" wording below.
  const existing = await prisma.equipment.findUnique({ where: { serial } })
  if (!existing) return null

  await prisma.equipment.update({
    where: { serial },
    // A supervisor's own direct edit is trusted immediately and is a step
    // above an inspector's observation, so it also clears (supersedes) any
    // still-unapproved location report rather than leaving it dangling.
    data: { location, pendingLocation: null, pendingLocationReportedBy: null, pendingLocationReportedAt: null },
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
        fromLocation: existing.location,
        authorName: managerName,
        timestamp: new Date().toISOString(),
      },
    ]
    await prisma.inspection.update({
      where: { id: latest.id },
      data: { review: { ...review, activity } },
    })
  }

  await recordSupervisor(managerName)

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/equipment/[serial]", "page")
  revalidatePath("/inspection")
  return null
}

// The supervisor-approval half of an inspector-reported location change —
// promotes pendingLocation to the trusted `location` everyone else reads,
// and logs it the same way updateEquipmentLocation's own direct edit does
// (same ActivityEntry shape) so approved-via-report and approved-via-manual
// changes read identically in the Activity trail/export.
export async function approvePendingLocation(
  _prevState: null,
  formData: FormData
): Promise<null> {
  await requireDashboardSession()
  const serial = String(formData.get("serial") ?? "")
  const managerName = String(formData.get("managerName") ?? "").trim() || "Unknown"
  if (!serial) return null

  const cookieStore = await cookies()
  cookieStore.set(MANAGER_NAME_COOKIE, managerName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })

  const equipment = await prisma.equipment.findUnique({ where: { serial } })
  if (!equipment?.pendingLocation) return null

  await prisma.equipment.update({
    where: { serial },
    data: {
      location: equipment.pendingLocation,
      pendingLocation: null,
      pendingLocationReportedBy: null,
      pendingLocationReportedAt: null,
    },
  })

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
        location: equipment.pendingLocation,
        fromLocation: equipment.location,
        authorName: managerName,
        timestamp: new Date().toISOString(),
      },
    ]
    await prisma.inspection.update({
      where: { id: latest.id },
      data: { review: { ...review, activity } },
    })
  }

  await recordSupervisor(managerName)

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/equipment/[serial]", "page")
  revalidatePath("/inspection")
  return null
}

// The reject half — a supervisor decided the reported location wasn't
// right, so it's cleared with no effect on the trusted `location`. The
// original report stays visible forever in the Activity trail (recorded as
// its own "location-pending" entry at submission time), just never applied.
export async function dismissPendingLocation(
  _prevState: null,
  formData: FormData
): Promise<null> {
  await requireDashboardSession()
  const serial = String(formData.get("serial") ?? "")
  if (!serial) return null

  await prisma.equipment.update({
    where: { serial },
    data: { pendingLocation: null, pendingLocationReportedBy: null, pendingLocationReportedAt: null },
  })

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/equipment/[serial]", "page")
  return null
}


// `nonce` changes on every successful save so the form can remount empty.
export type SupervisorListState = { error: string | null; nonce?: number }

// Settings → Supervisors. The list only feeds the Supervisor Signature
// picker; none of these touch a signature already on an inspection.
export async function addSupervisor(
  _prevState: SupervisorListState,
  formData: FormData
): Promise<SupervisorListState> {
  await requireDashboardSession()
  const name = normalizeSupervisorName(String(formData.get("name") ?? ""))
  if (!name) return { error: "Enter a name." }
  const existing = await prisma.supervisor.findUnique({ where: { name } })
  if (existing) return { error: `${name} is already on the list.` }
  await prisma.supervisor.create({ data: { name } })
  revalidatePath("/dashboard", "layout")
  return { error: null, nonce: Date.now() }
}

export async function renameSupervisor(
  _prevState: SupervisorListState,
  formData: FormData
): Promise<SupervisorListState> {
  await requireDashboardSession()
  const from = String(formData.get("from") ?? "")
  const to = normalizeSupervisorName(String(formData.get("to") ?? ""))
  if (!to) return { error: "Enter a name." }
  if (to === from) return { error: null }
  const taken = await prisma.supervisor.findUnique({ where: { name: to } })
  if (taken) return { error: `${to} is already on the list.` }
  const current = await prisma.supervisor.findUnique({ where: { name: from } })
  if (!current) return { error: `${from} is no longer on the list.` }
  // The name is the key, so a rename is a swap that keeps the list position.
  await prisma.$transaction([
    prisma.supervisor.delete({ where: { name: from } }),
    prisma.supervisor.create({ data: { name: to, createdAt: current.createdAt } }),
  ])
  revalidatePath("/dashboard", "layout")
  return { error: null }
}

export async function removeSupervisor(formData: FormData): Promise<void> {
  await requireDashboardSession()
  const name = String(formData.get("name") ?? "")
  await prisma.supervisor.deleteMany({ where: { name } })
  revalidatePath("/dashboard", "layout")
}
