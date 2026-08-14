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
import { isCriticalInspection, type ActivityEntry, type Stage } from "@/lib/review"
import { FLEET_TIME_ZONE } from "@/lib/shifts"
import { DASHBOARD_COOKIE, MANAGER_NAME_COOKIE, dashboardSessionValue } from "@/lib/auth"
import {
  buildRow,
  badSince,
  retentionCutoff,
  daysPassedCount,
  type InspectionRow,
} from "../../inspectionRow"
import StatusDot from "../../StatusDot"
import PhotoGallery from "../../PhotoGallery"
import LocationChangeControl from "../../LocationChangeControl"
import { saveActivity } from "../../actions"

const PAGE_SIZE = 20
// How far back "since" escalation looks for a run of consecutive bad
// inspections — bounded so the page never has to scan unlimited history.
const RECENT_LOOKBACK = 30

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serial: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    redirect("/dashboard")
  }

  const { serial } = await params
  const { page: pageParam } = await searchParams
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

  const [recentInspections, totalCount] = await Promise.all([
    prisma.inspection.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: RECENT_LOOKBACK,
    }),
    prisma.inspection.count({ where }),
  ])

  const recentHistory = recentInspections.map(buildRow)
  const latest = recentHistory[0]
  const stage = (latest?.stage ?? "none") as Stage | "none"
  const since = badSince(recentHistory, today)
  const daysPassed = since ? daysPassedCount(since, today) : 0

  const page = Math.max(1, Number(pageParam) || 1)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  // The first page overlaps with `recentHistory` (already fetched above), so
  // reuse it instead of re-querying the same rows.
  const pageHistory =
    page === 1
      ? recentHistory.slice(0, PAGE_SIZE)
      : (
          await prisma.inspection.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
          })
        ).map(buildRow)

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:max-w-2xl lg:max-w-4xl">
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
        className={`relative rounded-lg border bg-white p-4 ${
          stage === "unresolved" ? "border-red-300" : "border-gray-300"
        }`}
      >
        <div className="flex items-start gap-2">
          <span className="mt-1">
            <StatusDot stage={stage} size="lg" />
          </span>
          <div className="w-full">
            <p className={`text-lg font-semibold text-gray-900 ${since ? "pr-16" : ""}`}>
              {equipment.makeColor} · {equipmentTypeLabel(equipment.type)} · {equipment.flNumber}
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
              Serial#: {equipment.serial} ·
              <LocationChangeControl
                serial={equipment.serial}
                currentLocation={equipment.location}
                savedManagerName={savedManagerName}
              />
            </p>
            {addedAt && addedAt > EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT && (
              <p className="text-xs text-gray-400">
                Added {addedAt.toISOString().slice(0, 10)}
              </p>
            )}
            {latest ? (
              <p className="mt-1 text-sm text-gray-600">
                Last inspected {latest.inspection.date} · {latest.inspection.shift} ·{" "}
                {latest.inspection.firstName} {latest.inspection.lastName}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500">No inspection yet</p>
            )}
          </div>
        </div>

        {since && (
          <p className="absolute right-4 top-4 animate-[status-blink_3s_ease-in-out_infinite] text-right text-xs font-semibold leading-tight text-red-600">
            {daysPassed} day{daysPassed === 1 ? "" : "s"}
            <br />
            passed
          </p>
        )}
      </div>

      {latest && (
        <div className="mt-4 rounded-lg border border-gray-300 bg-white p-4">
          {latest.stage === "pending-confirm" &&
            !latest.flagged.every((q) => latest.review.issueStatus[q.id] === "complete") && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Mark every flagged item below <strong>Complete</strong>, then submit below to
                confirm all clear.
              </div>
            )}

          <form action={saveActivity} className="space-y-4">
            <input type="hidden" name="inspectionId" value={latest.inspection.id} />

            <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-1.5 text-sm">
              {(isCriticalInspection(latest.inspection)
                ? [REPAIR_REQUEST_QUESTION]
                : QUESTIONS
              ).map((q, i) => {
                const answer = latest.answers[q.id]
                if (!answer) return null
                const isRepairRequest = q.id === REPAIR_REQUEST_ISSUE_ID
                const bad = needsAttention(answer.value)
                const critical = isCriticalInspection(latest.inspection) && bad
                const status = latest.review.issueStatus[q.id]
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
                    <span className={`flex justify-end ${rowBorder}`}>
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

            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-3 text-sm font-semibold text-gray-900">Supervisor Review</p>
              <label className="mb-1 block text-sm font-medium text-gray-700">Note</label>
              <textarea
                name="noteText"
                placeholder="What did you check or change?"
                rows={2}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />

              <div className="mt-2 border-t border-gray-200 pt-3">
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
                <button
                  type="submit"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-base font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
                >
                  ✓ Sign & Confirm
                </button>
              </div>
            </div>

            {latest.review.activity.length > 0 && (
              <div className="border-t border-gray-100 pt-2.5">
                <p className="mb-1.5 text-xs font-semibold text-gray-500">Activity</p>
                <ul className="space-y-1.5">
                  {[...latest.review.activity].reverse().map((entry) => (
                    <li key={entry.id} className="text-xs text-gray-600">
                      <ActivityLine entry={entry} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <a
          href={`/dashboard/export/${equipment.serial}`}
          className="text-xs font-medium text-brand hover:underline"
        >
          Export this vehicle&apos;s history (CSV)
        </a>
        <a href="/dashboard/manage" className="text-xs font-medium text-gray-500 hover:underline">
          Manage this vehicle →
        </a>
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-gray-500">
          Inspection History ({totalCount})
        </p>
        <ul className="space-y-2">
          {pageHistory.map((row) => (
            <HistoryLine key={row.inspection.id} row={row} />
          ))}
        </ul>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link
                href={`/dashboard/equipment/${serial}?page=${page - 1}`}
                className="font-medium text-brand"
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-gray-500">
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={`/dashboard/equipment/${serial}?page=${page + 1}`}
                className="font-medium text-brand"
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function HistoryLine({ row }: { row: InspectionRow }) {
  return (
    <li className="rounded-lg border border-gray-200 p-3">
      <details>
        <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm transition-colors duration-100">
          <span className="text-gray-700">
            {row.inspection.date} · {row.inspection.shift} · {row.inspection.firstName}{" "}
            {row.inspection.lastName}
          </span>
          <StageBadge stage={row.stage} unresolvedCount={row.unresolved.length} />
        </summary>
        <div className="mt-2 space-y-2 border-l-2 border-gray-100 py-1 pl-3">
          {(isCriticalInspection(row.inspection) ? [REPAIR_REQUEST_QUESTION] : QUESTIONS).map(
            (q) => {
              const answer = row.answers[q.id]
              if (!answer) return null
              const isRepairRequest = q.id === REPAIR_REQUEST_ISSUE_ID
              const bad = needsAttention(answer.value)
              return (
                <div key={q.id}>
                  <div className={`text-xs ${bad ? "text-red-700" : "text-gray-600"}`}>
                    <span className="font-semibold">
                      {isRepairRequest ? "Repair Request" : `${q.number}. ${q.label}`}:
                    </span>{" "}
                    {isRepairRequest ? "" : answer.value}
                    {!isRepairRequest && answer.specify ? ` — ${answer.specify}` : ""}
                  </div>
                  {answer.note && (
                    <p className="text-xs text-gray-500">
                      {isRepairRequest ? "" : "Note: "}
                      {answer.note}
                    </p>
                  )}
                  {answer.photos && answer.photos.length > 0 && (
                    <div className="mt-1">
                      <PhotoGallery photos={answer.photos} notes={answer.photoNotes} />
                    </div>
                  )}
                </div>
              )
            }
          )}
        </div>
      </details>
    </li>
  )
}

function StageBadge({
  stage,
  unresolvedCount,
}: {
  stage: Stage
  unresolvedCount: number
}) {
  const base = "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"

  if (stage === "unresolved") {
    return (
      <span className={`${base} bg-red-100 text-red-700`}>🔴 {unresolvedCount} unresolved</span>
    )
  }
  if (stage === "pending-confirm") {
    return <span className={`${base} bg-amber-100 text-amber-700`}>🟡 Needs attention</span>
  }
  if (stage === "confirmed") {
    return <span className={`${base} bg-green-100 text-green-700`}>🟢 Resolved &amp; confirmed</span>
  }
  return <span className={`${base} bg-green-100 text-green-700`}>🟢 All good</span>
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
