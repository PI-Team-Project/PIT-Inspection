import Link from "next/link"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  QUESTIONS,
  QUESTIONS_BY_ID,
  needsAttention,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_QUESTION,
  type Question,
} from "@/lib/questions"
import { EQUIPMENT_LIST, type Equipment, type EquipmentType } from "@/lib/equipment"
import {
  parseReview,
  getStage,
  isCriticalInspection,
  flaggedIssueIds,
  type ActivityEntry,
  type Stage,
} from "@/lib/review"
import {
  DASHBOARD_COOKIE,
  MANAGER_NAME_COOKIE,
  dashboardSessionValue,
} from "@/lib/auth"
import PinForm from "./PinForm"
import HomeLink from "./HomeLink"
import PhotoGallery from "./PhotoGallery"
import { saveActivity, confirmResolved } from "./actions"

type Answers = Record<
  string,
  {
    value: string
    specify?: string
    note?: string
    photos?: string[]
    photoNotes?: string[]
  }
>
type InspectionRow = ReturnType<typeof buildRow>

const HISTORY_PREVIEW_COUNT = 5

function buildRow(
  inspection: Awaited<ReturnType<typeof prisma.inspection.findMany>>[number]
) {
  const answers = inspection.answers as Answers
  const review = parseReview(inspection.review)
  const flagged = flaggedIssueIds(inspection, answers).map(
    (id) => (id === REPAIR_REQUEST_ISSUE_ID ? REPAIR_REQUEST_QUESTION : QUESTIONS_BY_ID[id])
  )
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

const FORKLIFT_TYPES: EquipmentType[] = ["Sit Down", "Propane", "Standup"]

// Forklift inspection/activity history is dropped after 2 years; pallet
// jacks are kept longer (5 years) for now — separate retention windows per
// equipment category, not a single blanket cutoff.
const RETENTION_YEARS: Record<EquipmentType, number> = {
  "Sit Down": 2,
  Propane: 2,
  Standup: 2,
  "Pallet Jack": 5,
}

function retentionCutoff(type: EquipmentType, today: string): string {
  const cutoff = new Date(today)
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS[type])
  return cutoff.toISOString().slice(0, 10)
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

// The worst (lowest-ranked, most urgent) row in a group — used to sort
// whole category sections by urgency. An empty group sorts last.
function worstUrgency(rows: { stage: Stage | "none"; escalated: boolean }[]) {
  if (rows.length === 0) return Infinity
  return Math.min(...rows.map((row) => urgencyRank(row.stage, row.escalated)))
}

// The type filter has two tiers: a top-level category (Forklift / Pallet
// Jacks) and, once Forklift is picked, a multi-select of sub-types via the
// `sub` param. "forklift" (no capital, not a real EquipmentType) means "all
// forklifts." `sub` is a comma list of selected sub-types; zero selected
// makes no sense (there'd be nothing to show), so it's never producible —
// deselecting the last one just falls back to "all" instead.
function typeHref(filter: string | undefined, type: string | undefined) {
  const query: Record<string, string> = {}
  if (filter) query.filter = filter
  if (type) query.type = type
  return { pathname: "/dashboard", query }
}

function subtypeHref(filter: string | undefined, next: EquipmentType[]) {
  const query: Record<string, string> = { type: "forklift" }
  if (filter) query.filter = filter
  if (next.length > 0 && next.length < FORKLIFT_TYPES.length) query.sub = next.join(",")
  return { pathname: "/dashboard", query }
}

function toggleSubtype(active: EquipmentType[], type: EquipmentType): EquipmentType[] {
  const next = active.includes(type) ? active.filter((t) => t !== type) : [...active, type]
  return next.length === 0 ? FORKLIFT_TYPES : next
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    filter?: string
    type?: string
    sub?: string
  }>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()

  if (!authed) {
    return <PinForm error={params.error === "1"} />
  }

  const filter = params.filter
  const typeParam = params.type
  const isForkliftActive =
    typeParam === "forklift" || FORKLIFT_TYPES.includes(typeParam as EquipmentType)
  const parsedSubtypes = params.sub
    ? FORKLIFT_TYPES.filter((t) => params.sub!.split(",").includes(t))
    : FORKLIFT_TYPES
  const activeSubtypes: EquipmentType[] =
    parsedSubtypes.length > 0 ? parsedSubtypes : FORKLIFT_TYPES
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
    const cutoff = retentionCutoff(eq.type, today)
    const history = (historyByEquipment.get(eq.serial) ?? []).filter(
      (row) => row.inspection.date >= cutoff
    )
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
  const noInspectionCount = equipmentRows.filter((row) => isNotInspected(row.stage)).length

  // One simple group per forklift type, plus one for pallet jacks — kept as
  // a flat list rather than a nested category/type tree. Swapping to a
  // location-based grouping later is just a different group list here.
  const byType = (source: typeof equipmentRows, type: EquipmentType) =>
    source.filter((row) => row.equipment.type === type)

  const typedRows =
    !typeParam || typeParam === "all"
      ? rows
      : typeParam === "forklift"
        ? rows.filter((row) => activeSubtypes.includes(row.equipment.type))
        : rows.filter((row) => row.equipment.type === typeParam)

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="flex items-center gap-3">
        <HomeLink />
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Inspection Dashboard
        </h1>
      </div>

      <div className="mt-6 ml-auto flex w-fit flex-col items-stretch gap-0 text-sm font-medium">
        <Link
          href={filter === "working" ? "/dashboard" : "/dashboard?filter=working"}
          className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-100 active:scale-95 ${
            filter === "working" ? "bg-green-100 text-green-800" : "text-gray-700"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_3px_0.5px_rgba(34,197,94,0.9),0_0_6px_1px_rgba(34,197,94,0.5)]" />
          {workingCount}/{EQUIPMENT_LIST.length} working
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

      <div className="mt-4">
        <InspectionRequestBanner rows={equipmentRows} />
        <NeedsAttentionBanner rows={equipmentRows} />
      </div>

      <div className="mt-6 space-y-3">
        <FleetOverview
          title="Forklift"
          subgroups={FORKLIFT_TYPES.map((type) => ({
            label: type,
            rows: byType(equipmentRows, type),
          }))}
        />
        <FleetOverview
          title="Pallet Jacks"
          subgroups={[{ label: "Pallet Jack", rows: byType(equipmentRows, "Pallet Jack") }]}
        />
      </div>

      <div className="my-4 border-t border-gray-100" />

      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        <Link
          href={typeHref(filter, undefined)}
          className={`rounded-full px-3 py-1 transition-colors duration-100 active:scale-95 ${
            !typeParam ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          View All
        </Link>
        <Link
          href={typeHref(filter, "forklift")}
          className={`rounded-full px-3 py-1 transition-colors duration-100 active:scale-95 ${
            isForkliftActive ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          Forklift
        </Link>
        <Link
          href={typeHref(filter, "Pallet Jack")}
          className={`rounded-full px-3 py-1 transition-colors duration-100 active:scale-95 ${
            typeParam === "Pallet Jack" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          Pallet Jacks
        </Link>
      </div>

      {isForkliftActive && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-2 text-xs font-medium">
          <Link
            href={subtypeHref(filter, FORKLIFT_TYPES)}
            className={`rounded-full px-2.5 py-1 transition-colors duration-100 active:scale-95 ${
              activeSubtypes.length === FORKLIFT_TYPES.length
                ? "bg-blue-50 text-blue-700"
                : "text-gray-500"
            }`}
          >
            All
          </Link>
          {FORKLIFT_TYPES.map((type) => {
            const selected = activeSubtypes.includes(type)
            return (
              <Link
                key={type}
                href={subtypeHref(filter, toggleSubtype(activeSubtypes, type))}
                className={`rounded-full px-2.5 py-1 transition-colors duration-100 active:scale-95 ${
                  selected ? "bg-blue-50 text-blue-700" : "text-gray-500"
                }`}
              >
                {selected ? "✓ " : ""}
                {type}
              </Link>
            )
          })}
        </div>
      )}

      {typedRows.length === 0 && !filter && !typeParam && (
        <p className="mt-3 text-gray-500">No equipment on file.</p>
      )}

      {(() => {
        // Urgency-ordered by default (View All): the subtype with the worst
        // issue leads, and Forklift vs. Pallet Jacks swap order the same
        // way. Once the manager filters to a specific category, ordering
        // reverts to the plain canonical list — they already know what
        // they're looking at, so it should stay put rather than reshuffle.
        const unfiltered = !typeParam
        const orderedForkliftTypes = unfiltered
          ? [...FORKLIFT_TYPES].sort(
              (a, b) =>
                worstUrgency(byType(typedRows, a)) - worstUrgency(byType(typedRows, b))
            )
          : FORKLIFT_TYPES
        const palletRows = byType(typedRows, "Pallet Jack")

        const forkliftBlock = FORKLIFT_TYPES.some(
          (type) => byType(typedRows, type).length > 0
        ) && (
          <div key="forklift">
            <h2 className="mt-6 text-sm font-bold tracking-wide text-brand uppercase">
              Forklift
            </h2>
            {orderedForkliftTypes.map((type) => (
              <EquipmentSection
                key={type}
                title={type}
                rows={byType(typedRows, type)}
                today={today}
                savedManagerName={savedManagerName}
              />
            ))}
          </div>
        )

        const palletBlock = (
          <EquipmentSection
            key="pallet"
            title="Pallet Jacks"
            rows={palletRows}
            today={today}
            savedManagerName={savedManagerName}
            emphasize
          />
        )

        const forkliftFirst =
          !unfiltered ||
          worstUrgency(FORKLIFT_TYPES.flatMap((type) => byType(typedRows, type))) <=
            worstUrgency(palletRows)

        return forkliftFirst ? (
          <>
            {forkliftBlock}
            {palletBlock}
          </>
        ) : (
          <>
            {palletBlock}
            {forkliftBlock}
          </>
        )
      })()}

      <div className="mt-8 flex justify-end border-t border-gray-100 pt-4">
        <a
          href="/dashboard/export"
          className="shrink-0 rounded-lg border border-brand/30 px-3 py-2 text-sm font-medium text-brand transition-transform duration-100 active:scale-95 active:bg-brand/10"
        >
          Export CSV
        </a>
      </div>
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

function FleetOverview({
  title,
  subgroups,
}: {
  title: string
  subgroups: { label: string; rows: EquipmentRow[] }[]
}) {
  const visible = subgroups.filter((g) => g.rows.length > 0)
  const total = visible.reduce((sum, g) => sum + g.rows.length, 0)
  if (total === 0) return null
  const showSubLabels = visible.length > 1
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-brand uppercase">
        {title} ({total})
      </h3>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        {visible.map((g) => (
          <div key={g.label} className="flex items-center gap-2.5">
            {showSubLabels && (
              <span className="text-xs font-medium text-gray-500">
                {g.label} ({g.rows.length})
              </span>
            )}
            <div className="flex flex-wrap gap-1.5">
              {g.rows.map((row) => (
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
        ))}
      </div>
    </div>
  )
}

function InspectionRequestBanner({ rows }: { rows: EquipmentRow[] }) {
  const requested = rows.filter((row) => row.stage === "unresolved")

  if (requested.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
        🟢 No Inspection Requests — all equipment clear
      </p>
    )
  }

  return (
    <div className="rounded-md border-l-4 border-red-400 bg-red-50 py-2.5 pl-3 pr-3">
      <p className="text-sm text-red-700">
        <span className="font-semibold">🔴 Inspection Requested ({requested.length}):</span>{" "}
        {requested.map((row, i) => (
          <span key={row.equipment.serial}>
            {i > 0 && ", "}
            <a href={`#eq-${row.equipment.serial}`} className="underline">
              {row.equipment.flNumber} — {row.equipment.makeColor}
            </a>
          </span>
        ))}
      </p>
    </div>
  )
}

function NeedsAttentionBanner({ rows }: { rows: EquipmentRow[] }) {
  const needsAttentionRows = rows.filter((row) => row.stage === "pending-confirm")
  if (needsAttentionRows.length === 0) return null

  return (
    <div className="mt-2 rounded-md border-l-4 border-amber-400 bg-amber-50 py-2.5 pl-3 pr-3">
      <p className="text-sm text-amber-700">
        <span className="font-semibold">
          🟡 Needs Attention ({needsAttentionRows.length}):
        </span>{" "}
        {needsAttentionRows.map((row, i) => (
          <span key={row.equipment.serial}>
            {i > 0 && ", "}
            <a href={`#eq-${row.equipment.serial}`} className="underline">
              {row.equipment.flNumber} — {row.equipment.makeColor}
            </a>
          </span>
        ))}
      </p>
    </div>
  )
}

function EquipmentSection({
  title,
  rows,
  today,
  savedManagerName,
  emphasize,
}: {
  title: string
  rows: EquipmentRow[]
  today: string
  savedManagerName: string
  emphasize?: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div className="mt-6">
      <h2
        className={`mb-2 text-sm tracking-wide text-brand uppercase ${
          emphasize ? "font-bold" : "font-semibold opacity-80"
        }`}
      >
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
  const hasPhotos = latest
    ? Object.values(latest.answers).some((a) => (a.photos?.length ?? 0) > 0)
    : false

  return (
    <details
      id={`eq-${equipment.serial}`}
      className={`relative rounded-lg border bg-white p-4 ${
        escalated ? "border-red-300" : "border-gray-300"
      }`}
    >
      <summary className="-m-4 flex cursor-pointer items-start justify-between gap-3 rounded-lg p-4 transition-colors duration-100 active:bg-gray-50">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot stage={stage} size="lg" />
            <p className="text-lg font-semibold text-gray-900">
              {equipment.makeColor} · {equipment.type} · {equipment.flNumber}
            </p>
          </div>
          <div className="pl-7">
            <p className="text-sm text-gray-600">Serial#: {equipment.serial}</p>
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

            {(isCriticalInspection(latest.inspection)
              ? [REPAIR_REQUEST_QUESTION]
              : QUESTIONS
            ).map((q) => {
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
              return (
                <div key={q.id} className={bad ? "space-y-1.5" : ""}>
                  <div className={`text-sm ${textColor}`}>
                    <span className="font-semibold">
                      {isRepairRequest ? "Repair Request" : `${q.number}. ${q.label}`}:
                    </span>{" "}
                    {isRepairRequest ? "" : answer.value}
                    {!isRepairRequest && answer.specify ? ` — ${answer.specify}` : ""}
                  </div>
                  {answer.note && (
                    <p className="text-xs text-gray-600">
                      {isRepairRequest ? "" : "Note: "}
                      {answer.note}
                    </p>
                  )}
                  {answer.photos && answer.photos.length > 0 && (
                    <PhotoGallery photos={answer.photos} notes={answer.photoNotes} />
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

      {hasPhotos && (
        <span
          className="absolute bottom-2 right-2 text-gray-400"
          title="Photos attached"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M1 8a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 018.07 3h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0016.07 6H17a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V8zm13.5 3a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
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
          {(isCriticalInspection(row.inspection)
            ? [REPAIR_REQUEST_QUESTION]
            : QUESTIONS
          ).map((q) => {
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

const STATUS_DOT: Record<Stage | "none", { dot: string; glow: string; glowLg: string }> = {
  unresolved: {
    dot: "bg-red-500",
    glow: "shadow-[0_0_6px_2px_rgba(239,68,68,1),0_0_12px_3px_rgba(239,68,68,0.7)]",
    glowLg: "shadow-[0_0_5px_1px_rgba(239,68,68,0.9),0_0_10px_2px_rgba(239,68,68,0.5)]",
  },
  "pending-confirm": {
    dot: "bg-amber-500",
    glow: "shadow-[0_0_6px_2px_rgba(245,158,11,1),0_0_12px_3px_rgba(245,158,11,0.7)]",
    glowLg: "shadow-[0_0_5px_1px_rgba(245,158,11,0.9),0_0_10px_2px_rgba(245,158,11,0.5)]",
  },
  confirmed: {
    dot: "bg-green-500",
    glow: "shadow-[0_0_6px_2px_rgba(34,197,94,1),0_0_12px_3px_rgba(34,197,94,0.7)]",
    glowLg: "shadow-[0_0_5px_1px_rgba(34,197,94,0.9),0_0_10px_2px_rgba(34,197,94,0.5)]",
  },
  clean: {
    dot: "bg-green-500",
    glow: "shadow-[0_0_6px_2px_rgba(34,197,94,1),0_0_12px_3px_rgba(34,197,94,0.7)]",
    glowLg: "shadow-[0_0_5px_1px_rgba(34,197,94,0.9),0_0_10px_2px_rgba(34,197,94,0.5)]",
  },
  none: { dot: "bg-gray-400", glow: "", glowLg: "" },
}

function StatusDot({
  stage,
  size = "sm",
}: {
  stage: Stage | "none"
  size?: "sm" | "lg"
}) {
  const c = STATUS_DOT[stage]
  const blink = stage === "unresolved" ? "animate-[status-blink_1.3s_ease-in-out_infinite]" : ""
  if (size === "lg") {
    return <span className={`h-5 w-5 shrink-0 rounded-full ${c.dot} ${c.glowLg} ${blink}`} />
  }
  return <span className={`h-4 w-4 shrink-0 rounded-full ${c.dot} ${c.glow} ${blink}`} />
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
