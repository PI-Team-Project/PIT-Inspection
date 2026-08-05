import Link from "next/link"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { QUESTIONS, QUESTIONS_BY_ID, needsAttention, type Question } from "@/lib/questions"
import { EQUIPMENT_LIST, equipmentCategory, type Equipment } from "@/lib/equipment"
import { parseReview, getStage, type ActivityEntry, type Stage } from "@/lib/review"
import {
  DASHBOARD_COOKIE,
  MANAGER_NAME_COOKIE,
  dashboardSessionValue,
} from "@/lib/auth"
import PinForm from "./PinForm"
import HomeLink from "./HomeLink"
import { saveActivity, confirmResolved } from "./actions"

type Answers = Record<
  string,
  { value: string; specify?: string; note?: string; photos?: string[] }
>
type InspectionRow = ReturnType<typeof buildRow>

const HISTORY_PREVIEW_COUNT = 5

// RED is driven by the inspection's type, not by individual answers: a
// "Repair Request" submission is inherently critical; a "Daily" submission
// tops out at YELLOW (usable, needs attention) no matter what's flagged.
function isCriticalInspection(inspection: { type: string }): boolean {
  return inspection.type === "Repair Request"
}

function buildRow(
  inspection: Awaited<ReturnType<typeof prisma.inspection.findMany>>[number]
) {
  const answers = inspection.answers as Answers
  const review = parseReview(inspection.review)
  const flagged = QUESTIONS.filter((q) => needsAttention(answers[q.id]?.value ?? ""))
  const critical = isCriticalInspection(inspection) ? flagged : []
  const unresolved = critical.filter((q) => review.issueStatus[q.id] !== "complete")
  const stage = getStage(flagged.length, unresolved.length, review.confirmedResolved)
  return { inspection, answers, review, flagged, critical, unresolved, stage }
}

// Bad status is only "seen" if it's been sitting since a prior calendar day —
// walks back through history while the equipment stays unresolved/pending-confirm.
function badSince(history: InspectionRow[], today: string): string | null {
  let since: string | null = null
  for (const row of history) {
    if (row.stage === "unresolved" || row.stage === "pending-confirm") {
      since = row.inspection.date
    } else {
      break
    }
  }
  return since && since < today ? since : null
}

const URGENCY_RANK: Record<Stage | "none", number> = {
  unresolved: 0,
  "pending-confirm": 1,
  confirmed: 2,
  clean: 3,
  none: 4,
}

function urgencyRank(stage: Stage | "none", escalated: boolean) {
  const base = URGENCY_RANK[stage] * 2
  return escalated ? base - 1 : base
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; filter?: string }>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()

  if (!authed) {
    return <PinForm error={params.error === "1"} />
  }

  const filter = params.filter
  const savedManagerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value ?? ""
  const today = new Date().toISOString().slice(0, 10)

  const allInspections = await prisma.inspection.findMany({
    orderBy: { createdAt: "desc" },
  })

  const withFlags = allInspections.map(buildRow)

  const historyByEquipment = new Map<string, InspectionRow[]>()
  for (const row of withFlags) {
    const serial = row.inspection.equipmentSerial
    const list = historyByEquipment.get(serial)
    if (list) list.push(row)
    else historyByEquipment.set(serial, [row])
  }

  const equipmentRows = EQUIPMENT_LIST.map((eq) => {
    const history = historyByEquipment.get(eq.serial) ?? []
    const latest = history[0]
    const stage = (latest?.stage ?? "none") as Stage | "none"
    const since = badSince(history, today)
    return { equipment: eq, history, latest, stage, since, escalated: since !== null }
  }).sort(
    (a, b) => urgencyRank(a.stage, a.escalated) - urgencyRank(b.stage, b.escalated)
  )

  const isWorking = (stage: Stage | "none") => stage === "confirmed" || stage === "clean"
  const isNotWorking = (stage: Stage | "none") =>
    stage === "unresolved" || stage === "pending-confirm"
  const isNotInspected = (stage: Stage | "none") => stage === "none"

  const rows =
    filter === "working"
      ? equipmentRows.filter((row) => isWorking(row.stage))
      : filter === "not-working"
        ? equipmentRows.filter((row) => isNotWorking(row.stage))
        : filter === "not-inspected"
          ? equipmentRows.filter((row) => isNotInspected(row.stage))
          : equipmentRows

  const workingCount = equipmentRows.filter((row) => isWorking(row.stage)).length
  const notWorkingCount = equipmentRows.filter((row) => isNotWorking(row.stage)).length
  const noInspectionCount = equipmentRows.filter((row) => isNotInspected(row.stage)).length

  // Rows are already urgency-sorted; partitioning preserves that order within
  // each group. Grouped by equipment category for now — swapping to a
  // location-based grouping later is just a different partition key here.
  const forkliftRows = rows.filter((row) => equipmentCategory(row.equipment.type) === "Forklift")
  const palletJackRows = rows.filter(
    (row) => equipmentCategory(row.equipment.type) === "Pallet Jack"
  )

  // The at-a-glance overview always reflects the full fleet, regardless of
  // the working/not-working filter above — the point is to see everything
  // in one sight before scrolling into the filtered, detailed list.
  const allForkliftRows = equipmentRows.filter(
    (row) => equipmentCategory(row.equipment.type) === "Forklift"
  )
  const allPalletJackRows = equipmentRows.filter(
    (row) => equipmentCategory(row.equipment.type) === "Pallet Jack"
  )

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <HomeLink />
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Inspection Dashboard
          </h1>
        </div>
        <a
          href="/dashboard/export"
          className="ml-auto shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-transform duration-100 active:scale-95 active:bg-gray-100"
        >
          Export CSV
        </a>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 text-sm font-medium">
        <Link
          href={filter === "working" ? "/dashboard" : "/dashboard?filter=working"}
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-100 active:scale-95 ${
            filter === "working" ? "bg-green-100 text-green-800" : "text-gray-700"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_3px_0.5px_rgba(34,197,94,0.9),0_0_6px_1px_rgba(34,197,94,0.5)]" />
          {workingCount}/{EQUIPMENT_LIST.length} working
        </Link>
        <Link
          href={filter === "not-working" ? "/dashboard" : "/dashboard?filter=not-working"}
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-100 active:scale-95 ${
            filter === "not-working" ? "bg-red-100 text-red-800" : "text-gray-700"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_3px_0.5px_rgba(239,68,68,0.9),0_0_6px_1px_rgba(239,68,68,0.5)]" />
          {notWorkingCount}/{EQUIPMENT_LIST.length} not working
        </Link>
        {noInspectionCount > 0 && (
          <Link
            href={filter === "not-inspected" ? "/dashboard" : "/dashboard?filter=not-inspected"}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-100 active:scale-95 ${
              filter === "not-inspected" ? "bg-gray-200 text-gray-800" : "text-gray-500"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
            {noInspectionCount}/{EQUIPMENT_LIST.length} not yet inspected
          </Link>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <FleetOverview title="Forklifts" rows={allForkliftRows} />
        <FleetOverview title="Pallet Jacks" rows={allPalletJackRows} />
      </div>

      {rows.length === 0 && (
        <p className="mt-3 text-gray-500">
          {filter ? "No equipment matches this filter." : "No equipment on file."}
        </p>
      )}

      <EquipmentSection
        title="Forklifts"
        rows={forkliftRows}
        today={today}
        savedManagerName={savedManagerName}
      />
      <EquipmentSection
        title="Pallet Jacks"
        rows={palletJackRows}
        today={today}
        savedManagerName={savedManagerName}
      />
    </main>
  )
}

type EquipmentRow = {
  equipment: Equipment
  history: InspectionRow[]
  latest: InspectionRow | undefined
  stage: Stage | "none"
  since: string | null
  escalated: boolean
}

function FleetOverview({ title, rows }: { title: string; rows: EquipmentRow[] }) {
  if (rows.length === 0) return null
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {title} ({rows.length})
      </h3>
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
        {rows.map((row) => (
          <a
            key={row.equipment.serial}
            href={`#eq-${row.equipment.serial}`}
            title={`${row.equipment.flNumber} — ${row.equipment.makeColor}`}
            className="p-1"
          >
            <StatusDot stage={row.stage} />
          </a>
        ))}
      </div>
    </div>
  )
}

function EquipmentSection({
  title,
  rows,
  today,
  savedManagerName,
}: {
  title: string
  rows: EquipmentRow[]
  today: string
  savedManagerName: string
}) {
  if (rows.length === 0) return null
  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-semibold tracking-wide text-gray-500 uppercase">
        {title} ({rows.length})
      </h2>
      <div className="space-y-3">
        {rows.map((row) => (
          <EquipmentCard
            key={row.equipment.serial}
            row={row}
            today={today}
            savedManagerName={savedManagerName}
          />
        ))}
      </div>
    </div>
  )
}

function EquipmentCard({
  row: { equipment, history, latest, stage, since, escalated },
  today,
  savedManagerName,
}: {
  row: EquipmentRow
  today: string
  savedManagerName: string
}) {
  return (
    <details
      id={`eq-${equipment.serial}`}
      className={`rounded-lg border bg-white p-4 ${
        escalated ? "border-red-300" : "border-gray-300"
      }`}
    >
      <summary className="-m-4 flex cursor-pointer items-start justify-between gap-3 rounded-lg p-4 transition-colors duration-100 active:bg-gray-50">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot stage={stage} />
            <p className="text-lg font-semibold text-gray-900">
              {equipment.makeColor} — {equipment.type}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            {equipment.flNumber} · Serial#: {equipment.serial}
          </p>
          {latest ? (
            <p className="mt-1 text-sm text-gray-600">
              Last inspected {latest.inspection.date} ·{" "}
              {latest.inspection.shift} · {latest.inspection.firstName}{" "}
              {latest.inspection.lastName}
            </p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">No inspection yet</p>
          )}
          {latest &&
            (stage === "unresolved" || stage === "pending-confirm") &&
            latest.flagged.length > 0 && (
              <IssueLine
                flagged={latest.flagged}
                review={latest.review}
                critical={isCriticalInspection(latest.inspection)}
              />
            )}
        </div>
        {since && (
          <p className="shrink-0 pt-0.5 text-right text-xs font-semibold text-red-600">
            {daysPassedLabel(since, today)}
          </p>
        )}
      </summary>

      {latest && (
        <div className="mt-4 border-t border-gray-200 pt-4">
          {latest.stage === "pending-confirm" && (
            <form
              action={confirmResolved}
              className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
            >
              <input type="hidden" name="inspectionId" value={latest.inspection.id} />
              <input
                type="text"
                name="reviewerName"
                defaultValue={savedManagerName}
                placeholder="Supervisor name"
                required
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-amber-700"
              >
                ✓ Confirm All Clear
              </button>
            </form>
          )}

          <form action={saveActivity} className="space-y-2.5">
            <input type="hidden" name="inspectionId" value={latest.inspection.id} />

            {QUESTIONS.map((q) => {
              const answer = latest.answers[q.id]
              if (!answer) return null
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
              return (
                <div key={q.id} className={bad ? "space-y-1.5" : ""}>
                  <div className={`text-sm ${textColor}`}>
                    <span className="font-semibold">
                      {q.number}. {q.label}:
                    </span>{" "}
                    {answer.value}
                    {answer.specify ? ` — ${answer.specify}` : ""}
                  </div>
                  {answer.note && (
                    <p className="text-xs text-gray-600">Note: {answer.note}</p>
                  )}
                  {answer.photos && answer.photos.length > 0 && (
                    <div className="flex gap-1.5">
                      {answer.photos.map((src, i) => (
                        <a key={i} href={src} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt=""
                            className="h-14 w-14 rounded-md border border-gray-200 object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  {bad && (
                    <div className="flex gap-2">
                      <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-amber-700 has-checked:border-amber-500 has-checked:bg-amber-50">
                        <input
                          type="radio"
                          name={`issue_${q.id}`}
                          value="in_review"
                          required
                          defaultChecked={status === "in_review"}
                          className="h-3.5 w-3.5"
                        />
                        In Review
                      </label>
                      <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-blue-700 has-checked:border-blue-500 has-checked:bg-blue-50">
                        <input
                          type="radio"
                          name={`issue_${q.id}`}
                          value="complete"
                          required
                          defaultChecked={status === "complete"}
                          className="h-3.5 w-3.5"
                        />
                        Complete
                      </label>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Note
              </label>
              <textarea
                name="noteText"
                placeholder="What did you check or change?"
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Supervisor Confirmation
              </label>
              <input
                type="text"
                name="reviewerName"
                defaultValue={savedManagerName}
                placeholder="Name of the supervisor"
                required
                className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-base font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700"
              >
                ✓ Confirm Review
              </button>
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

          <div className="mt-5 border-t border-gray-200 pt-4">
            <p className="mb-2 text-xs font-semibold text-gray-500">
              Inspection History ({history.length})
            </p>
            <ul className="space-y-2">
              {history.slice(0, HISTORY_PREVIEW_COUNT).map((row) => (
                <HistoryLine key={row.inspection.id} row={row} />
              ))}
            </ul>
            {history.length > HISTORY_PREVIEW_COUNT && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-blue-600">
                  Show {history.length - HISTORY_PREVIEW_COUNT} more
                </summary>
                <ul className="mt-2 space-y-2">
                  {history.slice(HISTORY_PREVIEW_COUNT).map((row) => (
                    <HistoryLine key={row.inspection.id} row={row} />
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </details>
  )
}

function HistoryLine({ row }: { row: InspectionRow }) {
  return (
    <li>
      <details>
        <summary className="-mx-1 flex cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-1 text-sm transition-colors duration-100 active:bg-gray-50">
          <span className="text-gray-700">
            {row.inspection.date} · {row.inspection.shift} · {row.inspection.firstName}{" "}
            {row.inspection.lastName}
          </span>
          <StageBadge stage={row.stage} unresolvedCount={row.unresolved.length} compact />
        </summary>
        <div className="mt-2 space-y-2 border-l-2 border-gray-100 py-1 pl-3">
          {QUESTIONS.map((q) => {
            const answer = row.answers[q.id]
            if (!answer) return null
            const bad = needsAttention(answer.value)
            return (
              <div key={q.id}>
                <div className={`text-xs ${bad ? "text-red-700" : "text-gray-600"}`}>
                  <span className="font-semibold">
                    {q.number}. {q.label}:
                  </span>{" "}
                  {answer.value}
                  {answer.specify ? ` — ${answer.specify}` : ""}
                </div>
                {answer.note && (
                  <p className="text-xs text-gray-500">Note: {answer.note}</p>
                )}
                {answer.photos && answer.photos.length > 0 && (
                  <div className="mt-1 flex gap-1.5">
                    {answer.photos.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt=""
                          className="h-12 w-12 rounded-md border border-gray-200 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </details>
    </li>
  )
}

function daysPassedLabel(since: string, today: string): string {
  const days = Math.round(
    (new Date(today).getTime() - new Date(since).getTime()) / (1000 * 60 * 60 * 24)
  )
  return `${days} days passed`
}

const ISSUE_PREVIEW_COUNT = 3

const STATUS_DOT: Record<Stage | "none", { dot: string; glow: string }> = {
  unresolved: {
    dot: "bg-red-500",
    glow: "shadow-[0_0_3px_0.5px_rgba(239,68,68,0.9),0_0_6px_1px_rgba(239,68,68,0.5)]",
  },
  "pending-confirm": {
    dot: "bg-amber-500",
    glow: "shadow-[0_0_3px_0.5px_rgba(245,158,11,0.9),0_0_6px_1px_rgba(245,158,11,0.5)]",
  },
  confirmed: {
    dot: "bg-green-500",
    glow: "shadow-[0_0_3px_0.5px_rgba(34,197,94,0.9),0_0_6px_1px_rgba(34,197,94,0.5)]",
  },
  clean: {
    dot: "bg-green-500",
    glow: "shadow-[0_0_3px_0.5px_rgba(34,197,94,0.9),0_0_6px_1px_rgba(34,197,94,0.5)]",
  },
  none: { dot: "bg-gray-300", glow: "" },
}

function StatusDot({ stage }: { stage: Stage | "none" }) {
  const c = STATUS_DOT[stage]
  const blink = stage === "unresolved" ? "animate-[status-blink_1.3s_ease-in-out_infinite]" : ""
  return <span className={`h-3 w-3 shrink-0 rounded-full ${c.dot} ${c.glow} ${blink}`} />
}

function IssueLine({
  flagged,
  review,
  critical,
}: {
  flagged: Question[]
  review: { issueStatus: Record<string, string> }
  critical: boolean
}) {
  const shown = flagged.slice(0, ISSUE_PREVIEW_COUNT)
  const remaining = flagged.length - shown.length
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1 text-xs font-medium">
      {shown.map((q, i) => {
        const resolved = review.issueStatus[q.id] === "complete"
        const isRed = critical && !resolved
        return (
          <span key={q.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300">·</span>}
            <span className={isRed ? "text-red-700" : "text-amber-700"}>
              {q.shortLabel ?? q.label}
            </span>
          </span>
        )
      })}
      {remaining > 0 && (
        <span className="flex items-center gap-1 text-gray-400">
          {shown.length > 0 && <span className="text-gray-300">·</span>}
          +{remaining} more
        </span>
      )}
    </div>
  )
}

function StageBadge({
  stage,
  unresolvedCount,
  compact,
}: {
  stage: Stage
  unresolvedCount: number
  compact?: boolean
}) {
  const base = compact
    ? "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
    : "shrink-0 rounded-full px-3 py-1 text-xs font-semibold"

  if (stage === "unresolved") {
    return (
      <span className={`${base} bg-red-100 text-red-700`}>
        🔴 {unresolvedCount} unresolved
      </span>
    )
  }
  if (stage === "pending-confirm") {
    return (
      <span className={`${base} bg-amber-100 text-amber-700`}>
        🟡 Needs attention
      </span>
    )
  }
  if (stage === "confirmed") {
    return (
      <span className={`${base} bg-green-100 text-green-700`}>
        🟢 Resolved &amp; confirmed
      </span>
    )
  }
  return (
    <span className={`${base} bg-green-100 text-green-700`}>🟢 All good</span>
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
        ✓ Reviewed by{" "}
        <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  if (entry.type === "issue") {
    const q = QUESTIONS_BY_ID[entry.questionId]
    const label = entry.status === "complete" ? "Complete" : "In Review"
    return (
      <>
        <span className={entry.status === "complete" ? "text-blue-700" : "text-amber-700"}>
          {q?.label ?? entry.questionId} marked {label}
        </span>{" "}
        by <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  return (
    <>
      <span className="font-medium text-gray-800">{entry.authorName}</span>: {entry.text}{" "}
      — {when}
    </>
  )
}
