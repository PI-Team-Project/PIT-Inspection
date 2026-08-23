import { Fragment } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  QUESTIONS,
  QUESTIONS_BY_ID,
  needsAttention,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_QUESTION,
} from "@/lib/questions"
import { equipmentTypeLabel } from "@/lib/equipment"
import {
  getEquipmentBySerial,
  getEquipmentCreatedAt,
  EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT,
} from "@/lib/equipmentLocations"
import { isCriticalInspection, isCriticalFlag, type ActivityEntry, type Stage } from "@/lib/review"
import { FLEET_TIME_ZONE } from "@/lib/shifts"
import { DASHBOARD_COOKIE, MANAGER_NAME_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { buildRow, badSince, retentionCutoff, daysPassedCount } from "../../inspectionRow"
import StatusDot from "../../StatusDot"
import PhotoGallery from "../../PhotoGallery"
import LocationChangeControl from "../../LocationChangeControl"
import SignConfirmButton from "../../SignConfirmButton"
import { saveActivity } from "../../actions"
import VehicleHistory, { type LogEntry } from "./VehicleHistory"

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serial: string }>
  searchParams: Promise<{ date?: string; shift?: string }>
}) {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    redirect("/dashboard")
  }

  const { serial } = await params
  const { date: highlightDate, shift: highlightShift } = await searchParams
  const savedManagerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value ?? ""
  const today = new Date().toISOString().slice(0, 10)
  const todayDisplay = new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date())

  const equipment = await getEquipmentBySerial(serial)
  if (!equipment) notFound()
  const addedAt = await getEquipmentCreatedAt(serial)

  const cutoff = retentionCutoff(equipment.type, today)
  const where = { equipmentSerial: serial, date: { gte: cutoff } }

  // Photos aren't needed for the calendar/log views or for finding which
  // inspection is "selected" below — only the one inspection actually
  // rendered in detail needs its photo bytes, fetched separately once it's
  // known which one that is. Retention already bounds this to at most a
  // few years of twice-daily rows per vehicle, so one full-range query
  // (versus the fleet-wide dashboard query this app already had to fix)
  // stays cheap.
  const allInspections = await prisma.inspection.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })
  const allHistory = allInspections.map(buildRow)
  const latest = allHistory[0]
  const stage = (latest?.stage ?? "none") as Stage | "none"
  const since = badSince(allHistory, today)
  const daysPassed = since ? daysPassedCount(since, today) : 0

  // The page never drops straight into an inspection unless the visitor
  // asked for one: either a specific day+shift (Weekly Report / History
  // links all end in ?date=&shift=), or — with nothing picked — the latest
  // inspection IF it's still actually actionable. Anything already clean
  // or confirmed stays out of the way on the overview below.
  const selectedId = highlightDate && highlightShift
    ? (allHistory.find(
        (row) => row.inspection.date === highlightDate && row.inspection.shift === highlightShift
      )?.inspection.id ?? null)
    : latest && (latest.stage === "unresolved" || latest.stage === "pending-confirm")
      ? latest.inspection.id
      : null

  const selectedInspection = selectedId
    ? await prisma.inspection.findUnique({ where: { id: selectedId }, include: { photos: true } })
    : null
  const selected = selectedInspection ? buildRow(selectedInspection) : null

  // A single, always-in-the-same-place verdict — the one thing a manager
  // actually needs to know before reading anything else on the page.
  const verdict =
    stage === "unresolved"
      ? { label: "Needs Review", badge: "bg-red-50 text-red-700" }
      : stage === "pending-confirm"
        ? { label: "Needs Attention", badge: "bg-amber-50 text-amber-700" }
        : stage === "none"
          ? { label: "No Inspections Yet", badge: "bg-gray-100 text-gray-500" }
          : { label: "All Clear", badge: "bg-green-50 text-green-700" }

  const logEntries: LogEntry[] = allHistory.map((row) => ({
    id: row.inspection.id,
    date: row.inspection.date,
    shift: row.inspection.shift as "Day" | "Night",
    inspectorName: `${row.inspection.firstName} ${row.inspection.lastName}`,
    stage: row.stage,
  }))

  // Capped at 2xl (not lg:4xl) and never wider — this is a page of short
  // text lines and a handful of narrow columns, not a wide table like the
  // dashboard's Weekly Report. Growing the container past a comfortable
  // reading width just left every card stretched with a lot of dead space,
  // regardless of how big the screen actually is.
  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:max-w-2xl">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 111.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        Dashboard
      </Link>

      <div
        className={`rounded-lg border bg-white p-3 ${
          stage === "unresolved" ? "border-red-300" : "border-gray-300"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <StatusDot stage={stage} size="sm" />
            <p className="text-base font-semibold text-gray-900">
              {equipment.makeColor} · {equipmentTypeLabel(equipment.type)} · {equipment.flNumber}
            </p>
          </div>
          {since && (
            <p className="animate-[status-blink_3s_ease-in-out_infinite] shrink-0 text-right text-xs font-semibold leading-tight text-red-600">
              {daysPassed}d passed
            </p>
          )}
        </div>

        {/* A small supporting tag, not a headline — the vehicle's own name
            above is what should draw the eye first. */}
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${verdict.badge}`}
        >
          {verdict.label}
        </span>

        <div className="mt-1.5 space-y-0.5">
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
            Serial#: {equipment.serial} ·
            <LocationChangeControl
              serial={equipment.serial}
              currentLocation={equipment.location}
              savedManagerName={savedManagerName}
            />
          </p>
          {addedAt && addedAt > EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT && (
            <p className="text-xs text-gray-400">Added {addedAt.toISOString().slice(0, 10)}</p>
          )}
          {latest ? (
            <p className="text-sm text-gray-600">
              Last inspected {latest.inspection.date} · {latest.inspection.shift} ·{" "}
              {latest.inspection.firstName} {latest.inspection.lastName}
            </p>
          ) : (
            <p className="text-sm text-gray-500">No inspection yet</p>
          )}
        </div>
      </div>

      {selected ? (
        <div id="selected-inspection" className="mt-6 scroll-mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-500">
              {highlightDate
                ? `Viewing ${selected.inspection.date} · ${selected.inspection.shift}`
                : "Needs Your Review"}
            </p>
            {highlightDate && (
              <Link
                href={`/dashboard/equipment/${serial}`}
                className="text-xs font-medium text-gray-500 hover:underline"
              >
                ← Back to overview
              </Link>
            )}
          </div>
        <div className="rounded-lg border border-gray-300 bg-white p-4">
          {selected.stage === "pending-confirm" &&
            !selected.flagged.every((q) => selected.review.issueStatus[q.id] === "complete") && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Mark every flagged item below <strong>Complete</strong>, then submit below to
                confirm all clear.
              </div>
            )}

          <form action={saveActivity} className="space-y-4">
            <input type="hidden" name="inspectionId" value={selected.inspection.id} />

            <div className="grid max-w-xl grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-1.5 text-sm">
              {(isCriticalInspection(selected.inspection)
                ? [REPAIR_REQUEST_QUESTION]
                : QUESTIONS
              ).map((q, i) => {
                const answer = selected.answers[q.id]
                if (!answer) return null
                const isRepairRequest = q.id === REPAIR_REQUEST_ISSUE_ID
                const bad = needsAttention(answer.value)
                const critical = bad && isCriticalFlag(selected.inspection, q.id)
                const status = selected.review.issueStatus[q.id]
                const fixed = bad && status === "complete"
                const textColor = fixed
                  ? "text-gray-500"
                  : critical
                    ? "text-red-700"
                    : bad
                      ? "text-amber-700"
                      : "text-gray-700"
                const rowBorder = i > 0 ? "border-t border-gray-100 pt-1.5" : ""
                return (
                  <Fragment key={q.id}>
                    <span className={`whitespace-nowrap font-semibold ${textColor} ${rowBorder}`}>
                      {isRepairRequest ? "Repair Request" : `${q.number}. ${q.label}`}
                    </span>
                    <span className={`${textColor} ${rowBorder}`}>
                      {isRepairRequest ? "" : answer.value}
                      {!isRepairRequest && answer.specify ? ` — ${answer.specify}` : ""}
                    </span>
                    <span className="flex justify-end">
                      {bad && (
                        <label
                          title={status === "complete" ? "Marked fixed — click to reopen" : "Click to mark fixed"}
                          className="inline-flex h-6 w-6 shrink-0 cursor-pointer select-none items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-sm leading-none shadow-sm transition-all duration-100 hover:border-amber-400 hover:bg-amber-100 active:scale-90 has-checked:border-green-300 has-checked:bg-green-50"
                        >
                          <input
                            type="checkbox"
                            name={`issue_${q.id}`}
                            value="complete"
                            defaultChecked={status === "complete"}
                            className="peer sr-only"
                          />
                          <span className="sr-only">Mark fixed</span>
                          <span className="peer-checked:hidden">⚠</span>
                          <span className="hidden peer-checked:inline">✓</span>
                        </label>
                      )}
                    </span>
                    {(answer.note || (answer.photos && answer.photos.length > 0)) && (
                      <div className="col-span-3 -mt-0.5 flex flex-wrap items-start gap-2">
                        {answer.note && (
                          <p className="text-xs text-gray-500">
                            {isRepairRequest ? "" : "Note: "}
                            {answer.note}
                          </p>
                        )}
                        {answer.photos && answer.photos.length > 0 && (
                          <PhotoGallery photos={answer.photos} notes={answer.photoNotes} />
                        )}
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>

            <div className="mt-6 max-w-xl rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-3 text-sm font-semibold text-gray-900">Supervisor Review</p>
              <label className="mb-1 block text-sm font-medium text-gray-700">Note</label>
              <textarea
                name="noteText"
                placeholder="What did you check or change?"
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />

              <div className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Supervisor Signature
                    </label>
                    <input
                      type="text"
                      name="reviewerName"
                      defaultValue={savedManagerName}
                      placeholder="Name of the supervisor"
                      required
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                    <p className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-600">
                      {todayDisplay}
                    </p>
                  </div>
                </div>
                <SignConfirmButton />
              </div>
            </div>

            {selected.review.activity.length > 0 && (
              <div className="border-t border-gray-100 pt-2.5">
                <p className="mb-1.5 text-xs font-semibold text-gray-500">Activity</p>
                <ul className="space-y-1.5">
                  {[...selected.review.activity].reverse().map((entry) => (
                    <li key={entry.id} className="text-xs text-gray-600">
                      <ActivityLine entry={entry} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </div>
        </div>
      ) : highlightDate ? (
        <div
          id="selected-inspection"
          className="mt-6 scroll-mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500"
        >
          No inspection found for {highlightDate} · {highlightShift}.
        </div>
      ) : (
        <div
          className={`mt-6 rounded-lg border p-4 text-center text-sm font-medium ${
            latest
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-gray-200 bg-gray-50 text-gray-500"
          }`}
        >
          {latest
            ? "✓ All caught up — nothing needs review right now."
            : "No inspections yet — this vehicle hasn't been checked in."}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
        <a
          href={`/dashboard/export/${equipment.serial}`}
          className="font-medium hover:text-brand hover:underline"
        >
          Export CSV
        </a>
        <a href="/dashboard/manage" className="font-medium hover:text-gray-600 hover:underline">
          Manage this vehicle →
        </a>
      </div>

      <div className="mt-6">
        <VehicleHistory serial={serial} todayKey={today} entries={logEntries} />
      </div>
    </main>
  )
}

function ActivityLine({ entry }: { entry: ActivityEntry }) {
  const when = new Date(entry.timestamp).toLocaleString()

  if (entry.type === "confirmed") {
    return (
      <>
        🟢 Confirmed all clear by{" "}
        <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  if (entry.type === "viewed") {
    return (
      <>
        ✓ Reviewed by <span className="font-medium text-gray-800">{entry.authorName}</span> —{" "}
        {when}
      </>
    )
  }

  if (entry.type === "location") {
    return (
      <>
        📍 Location set to{" "}
        <span className="font-medium text-gray-800">{entry.location}</span> by{" "}
        <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  if (entry.type === "issue") {
    const q = QUESTIONS_BY_ID[entry.questionId]
    const label = entry.status === "complete" ? "Complete" : "In Review"
    return (
      <>
        <span className={entry.status === "complete" ? "text-brand" : "text-amber-700"}>
          {q?.label ?? entry.questionId} marked {label}
        </span>{" "}
        by <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  return (
    <>
      <span className="font-medium text-gray-800">{entry.authorName}</span>: {entry.text} —{" "}
      {when}
    </>
  )
}
