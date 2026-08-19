import { Fragment } from "react"
import Link from "next/link"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { type Question } from "@/lib/questions"
import {
  equipmentCategory,
  equipmentTypeLabel,
  isUnderRepair,
  LOCATIONS,
  type Equipment,
  type EquipmentType,
} from "@/lib/equipment"
import { getActiveEquipmentList, getRetiredEquipmentNearingExpiry } from "@/lib/equipmentLocations"
import LiveClock from "./LiveClock"
import { isCriticalInspection, type Stage } from "@/lib/review"
import {
  getCurrentShiftWindow,
  getMostRecentShiftWindows,
  getShiftWindowForDate,
  mondayOfWeek,
  shiftDateKeyByDays,
  easternDateKey,
  FLEET_TIME_ZONE,
} from "@/lib/shifts"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import PinForm from "./PinForm"
import HomeLink from "./HomeLink"
import StatusDot from "./StatusDot"
import LocationVehiclesButton from "./LocationVehiclesButton"
import EquipmentSearch from "./EquipmentSearch"
import EquipmentBrowser from "./EquipmentBrowser"
import InspectedChip from "./InspectedChip"
import ShiftDateNav from "./ShiftDateNav"
import WeeklyReport from "./WeeklyReport"
import {
  buildRow,
  badSince,
  retentionCutoff,
  daysPassedCount,
  weeklyCellStage,
  RETENTION_YEARS,
  type InspectionRow,
} from "./inspectionRow"

const FORKLIFT_TYPES: EquipmentType[] = ["Sit Down", "Propane", "Standup"]

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
  searchParams: Promise<{
    error?: string
    minutes?: string
    filter?: string
    shift?: string
    date?: string
  }>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()

  if (!authed) {
    return (
      <PinForm
        error={params.error === "1"}
        lockedMinutes={params.error === "locked" ? Number(params.minutes) || 1 : undefined}
      />
    )
  }

  const filter = params.filter
  const today = new Date().toISOString().slice(0, 10)
  // `today` is a plain calendar-date string with no time zone of its own —
  // formatting it as UTC (rather than the server's local zone) guarantees
  // the displayed month/day always matches its digits, with no drift.
  const todayDisplay = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${today}T00:00:00Z`))

  // No equipment's retention window (see RETENTION_YEARS) reaches back
  // further than the longest one — anything older is guaranteed to be
  // filtered out below regardless of type, so excluding it here changes
  // nothing about the result. Without this, the query pulled every
  // inspection ever recorded (photos included) on every dashboard load,
  // getting slower every month as the table grows.
  const maxRetentionYears = Math.max(...Object.values(RETENTION_YEARS))
  const oldestPossibleCutoff = new Date(today)
  oldestPossibleCutoff.setFullYear(oldestPossibleCutoff.getFullYear() - maxRetentionYears)

  const [allInspections, equipmentList, expiringRetired] = await Promise.all([
    prisma.inspection.findMany({
      where: { createdAt: { gte: oldestPossibleCutoff } },
      orderBy: { createdAt: "desc" },
      // Never needs actual photo bytes here, only whether any exist
      // (EquipmentCard's hasPhotos) — a count join costs nothing close to
      // what pulling every base64 photo in the retention window would.
      include: { _count: { select: { photos: true } } },
    }),
    getActiveEquipmentList(),
    getRetiredEquipmentNearingExpiry(30),
  ])

  const withFlags = allInspections.map(buildRow)

  const historyByEquipment = new Map<string, InspectionRow[]>()
  for (const row of withFlags) {
    const serial = row.inspection.equipmentSerial
    const list = historyByEquipment.get(serial)
    if (list) list.push(row)
    else historyByEquipment.set(serial, [row])
  }

  const equipmentRows = equipmentList.map((eq) => {
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

  const now = new Date()
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(now)
    .replace(" ", "")
  const currentShift = getCurrentShiftWindow(now)
  const recentShifts = getMostRecentShiftWindows(now)
  const selectedShiftLabel = params.shift === "night" ? "Night" : params.shift === "day" ? "Day" : currentShift.label

  // A `date` param drives historical navigation (back-arrow / calendar
  // picker). Only trusted when it parses AND doesn't land in the future —
  // the client-side nav already blocks bad jumps before they happen, but a
  // hand-edited URL falls back to "most recent" instead of rendering junk.
  const dateParam = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null
  const requestedWindow = dateParam
    ? getShiftWindowForDate(dateParam, selectedShiftLabel as "Day" | "Night")
    : null
  const shiftWindow =
    requestedWindow && requestedWindow.start.getTime() <= currentShift.start.getTime()
      ? requestedWindow
      : recentShifts[selectedShiftLabel as "Day" | "Night"]
  const isViewingLive = shiftWindow.start.getTime() === currentShift.start.getTime()

  const todayKey = easternDateKey(now)
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    shiftDateKeyByDays(mondayOfWeek(todayKey), i)
  )
  const weeklyRows = equipmentRows.map((row) => ({
    serial: row.equipment.serial,
    flNumber: row.equipment.flNumber,
    cells: weekDays.map((dateKey) => ({
      day: weeklyCellStage(row.history, dateKey, "Day"),
      night: weeklyCellStage(row.history, dateKey, "Night"),
    })),
  }))

  const inspectedThisShift = (row: EquipmentRow) => {
    // Unresolved (red) means out of service until fixed — being inspected
    // this shift doesn't make it ready to use, so it never counts as
    // "Inspected" regardless of timing.
    if (row.stage === "unresolved") return false
    const createdAt = row.latest?.inspection.createdAt
    return Boolean(createdAt && createdAt >= shiftWindow.start && createdAt < shiftWindow.end)
  }

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

  // Lean, client-safe slice for the search popup — never pass `latest`/
  // `history` down since those carry full inspection answers (photos
  // included, as base64 data URIs), which would bloat the client bundle.
  const searchableEquipment = equipmentRows.map((row) => ({
    serial: row.equipment.serial,
    flNumber: row.equipment.flNumber,
    makeColor: row.equipment.makeColor,
    type: row.equipment.type,
    location: row.equipment.location,
    stage: row.stage,
    lastInspectedDate: row.latest?.inspection.date ?? null,
  }))

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:max-w-2xl lg:max-w-4xl">
      <div className="flex items-center gap-3">
        <HomeLink />
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          Inspection Dashboard
        </h1>
        <div className="ml-auto">
          <EquipmentSearch equipment={searchableEquipment} />
        </div>
      </div>

      <div className="mt-3 border-t border-gray-100" />

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <LiveClock timeZone={FLEET_TIME_ZONE} initialLabel={timeLabel} />
          <span className="text-xs font-medium text-gray-400">Eastern Time — Holland, MI</span>
        </div>
        <div className="flex w-fit flex-col items-stretch gap-0 text-sm font-medium">
          <Link
            href={filter === "working" ? "/dashboard" : "/dashboard?filter=working"}
            scroll={false}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-100 active:scale-95 ${
              filter === "working" ? "bg-green-100 text-green-800" : "text-gray-700"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_3px_0.5px_rgba(34,197,94,0.9),0_0_6px_1px_rgba(34,197,94,0.5)]" />
            {workingCount}/{equipmentList.length}
          </Link>
          {noInspectionCount > 0 && (
            <Link
              href={filter === "not-inspected" ? "/dashboard" : "/dashboard?filter=not-inspected"}
              scroll={false}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors duration-100 active:scale-95 ${
                filter === "not-inspected" ? "bg-gray-200 text-gray-800" : "text-gray-500"
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
              {noInspectionCount}/{equipmentList.length}
              <span className="hidden sm:inline">&nbsp;never inspected</span>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4">
        <WeeklyReport weekDays={weekDays} rows={weeklyRows} todayKey={todayKey} />
      </div>

      <div className="mt-4">
        <ShiftOverview
          shiftWindow={shiftWindow}
          selectedShiftLabel={selectedShiftLabel}
          currentShiftLabel={currentShift.label}
          dateParam={dateParam}
          todayKey={todayKey}
          isViewingLive={isViewingLive}
          rows={equipmentRows}
          inspectedThisShift={inspectedThisShift}
        />
      </div>

      <div className="my-3 border-t border-gray-200" />

      <details className="group rounded-lg border border-gray-200">
        <summary className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-100 hover:bg-gray-50 active:scale-[0.99] active:bg-gray-100">
          <span>View Vehicle Status</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </summary>
        <div className="space-y-3 border-t border-gray-200 p-3">
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
            compact
          />
        </div>
      </details>

      <div className="mt-2">
        <LocationOverview rows={equipmentRows} />
      </div>

      <div className="my-3 border-t border-gray-200" />

      <EquipmentBrowser
        cards={rows.map((row) => ({
          serial: row.equipment.serial,
          type: row.equipment.type,
          stage: row.stage,
          escalated: row.escalated,
          node: (
            <EquipmentCard
              key={row.equipment.serial}
              row={row}
              today={today}
              todayDisplay={todayDisplay}
            />
          ),
          tableRow: <EquipmentTableRow key={row.equipment.serial} row={row} />,
        }))}
      />

      {expiringRetired.length > 0 && (
        <Link
          href="/dashboard/manage"
          className="mt-4 block rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800 hover:bg-amber-100"
        >
          <span className="font-semibold">
            <span className="text-amber-500">▶</span> Retention Expiring Soon (
            {expiringRetired.length}):
          </span>{" "}
          {expiringRetired.map((eq, i) => (
            <span key={eq.serial}>
              {i > 0 && ", "}
              {eq.flNumber} — {eq.expiresAt.toISOString().slice(0, 10)}
            </span>
          ))}
        </Link>
      )}

      <div className="mt-8 flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Link
          href="/dashboard/manage"
          className="shrink-0 rounded-lg border border-brand/30 px-3 py-2 text-sm font-medium text-brand transition-transform duration-100 active:scale-95 active:bg-brand/10"
        >
          Manage Vehicles
        </Link>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- CSV download endpoint, not a page */}
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
  compact = false,
}: {
  title: string
  subgroups: { label: EquipmentType; rows: EquipmentRow[] }[]
  compact?: boolean
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
      <div
        className={`flex flex-col gap-y-1.5 rounded-lg border border-gray-200 px-3 ${
          compact ? "py-1.5" : "py-3"
        }`}
      >
        {visible.map((g, i) => (
          <div
            key={g.label}
            className={`flex items-center gap-[5px] ${
              showSubLabels && i > 0 ? "border-t border-gray-200/70 pt-1.5" : ""
            }`}
          >
            {showSubLabels && (
              <span className="w-24 shrink-0 text-xs font-medium text-gray-500">
                {equipmentTypeLabel(g.label)} ({g.rows.length})
              </span>
            )}
            <div className="flex flex-wrap gap-1">
              {g.rows.map((row) => (
                <a
                  key={row.equipment.serial}
                  href={`/dashboard/equipment/${row.equipment.serial}`}
                  title={`${row.equipment.flNumber} — ${row.equipment.makeColor}`}
                  className="flex p-1"
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

function LocationOverview({ rows }: { rows: EquipmentRow[] }) {
  const byLocation = LOCATIONS.map((location) => ({
    location,
    rows: rows.filter((row) => row.equipment.location === location),
  })).filter((g) => g.rows.length > 0)

  if (byLocation.length === 0) return null

  const half = Math.ceil(byLocation.length / 2)
  const left = byLocation.slice(0, half)
  const right = byLocation.slice(half)

  return (
    <details className="group rounded-lg border border-gray-200">
      <summary className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors duration-100 hover:bg-gray-50 active:scale-[0.99] active:bg-gray-100">
        <span>Vehicle Per Location</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </summary>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 border-t border-gray-200 p-3 lg:hidden">
        <LocationRows locations={byLocation} />
      </div>
      <div className="hidden gap-x-8 border-t border-gray-200 p-3 lg:grid lg:grid-cols-2">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
          <LocationRows locations={left} />
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
          <LocationRows locations={right} />
        </div>
      </div>
    </details>
  )
}

function LocationRows({
  locations,
}: {
  locations: { location: string; rows: EquipmentRow[] }[]
}) {
  return (
    <>
      {locations.map((g, i) => {
        const forkliftRows = g.rows.filter(
          (row) => equipmentCategory(row.equipment.type) === "Forklift"
        )
        const palletRows = g.rows.filter(
          (row) => equipmentCategory(row.equipment.type) === "Pallet Jack"
        )
        const showTypeTags = forkliftRows.length > 0 && palletRows.length > 0
        const rowBorder = i > 0 ? "border-t border-gray-200 pt-1" : ""

        return (
          <Fragment key={g.location}>
            <span className={rowBorder}>
              <LocationVehiclesButton
                location={g.location}
                count={g.rows.length}
                vehicles={g.rows.map((row) => ({
                  serial: row.equipment.serial,
                  flNumber: row.equipment.flNumber,
                  makeColor: row.equipment.makeColor,
                  stage: row.stage,
                }))}
              />
            </span>
            <div className={`flex flex-wrap items-center gap-2 ${rowBorder}`}>
              {[
                { label: "FL", rows: forkliftRows },
                { label: "PJ", rows: palletRows },
              ]
                .filter((sg) => sg.rows.length > 0)
                .map((sg) => (
                  <span key={sg.label} className="flex items-center gap-1">
                    {showTypeTags && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[9px] font-bold text-gray-700">
                        {sg.label}
                      </span>
                    )}
                    <span className="flex flex-wrap gap-1">
                      {sg.rows.map((row) => (
                        <a
                          key={row.equipment.serial}
                          href={`/dashboard/equipment/${row.equipment.serial}`}
                          title={`${row.equipment.flNumber} — ${row.equipment.makeColor}`}
                          className="flex p-1"
                        >
                          <StatusDot stage={row.stage} size="xl" />
                        </a>
                      ))}
                    </span>
                  </span>
                ))}
            </div>
          </Fragment>
        )
      })}
    </>
  )
}

function ShiftOverview({
  shiftWindow,
  selectedShiftLabel,
  currentShiftLabel,
  dateParam,
  todayKey,
  isViewingLive,
  rows,
  inspectedThisShift,
}: {
  shiftWindow: { label: string; start: Date; end: Date }
  selectedShiftLabel: string
  currentShiftLabel: string
  dateParam: string | null
  todayKey: string
  isViewingLive: boolean
  rows: EquipmentRow[]
  inspectedThisShift: (row: EquipmentRow) => boolean
}) {
  const inspected = rows.filter(inspectedThisShift)
  // Unresolved (red) ones sort first in `rows` overall (most urgent), but
  // here they should trail at the end of this specific list instead.
  const notInspected = rows
    .filter((row) => !inspectedThisShift(row))
    .sort((a, b) => Number(a.stage === "unresolved") - Number(b.stage === "unresolved"))

  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(shiftWindow.start)
  const hoursLabel = shiftWindow.label === "Day" ? "5am–5pm" : "5pm–5am"
  const dateKey = easternDateKey(shiftWindow.start)

  return (
    <div>
      <div className="mb-2 flex gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
        {(["Day", "Night"] as const).map((label) => {
          const selected = selectedShiftLabel === label
          const isLive = currentShiftLabel === label
          const href = dateParam
            ? `/dashboard?shift=${label.toLowerCase()}&date=${dateParam}`
            : `/dashboard?shift=${label.toLowerCase()}`
          return (
            <Link
              key={label}
              href={href}
              scroll={false}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
                selected ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {label} Shift{isLive && " · Now"}
            </Link>
          )
        })}
      </div>

      <ShiftDateNav
        dateKey={dateKey}
        todayKey={todayKey}
        label={shiftWindow.label as "Day" | "Night"}
        dateLabel={dateLabel}
        hoursLabel={hoursLabel}
        isViewingLive={isViewingLive}
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 shadow-sm">
          <p className="pb-1.5 text-sm font-semibold text-green-800">
            Inspected ({inspected.length}/{rows.length})
          </p>
          {inspected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-green-200/60 pt-2">
              {inspected.map((row) => {
                const isPendingConfirm = row.stage === "pending-confirm"
                const inspectorName = row.latest
                  ? `${row.latest.inspection.firstName} ${row.latest.inspection.lastName}`
                  : "Unknown"
                return (
                  <InspectedChip
                    key={row.equipment.serial}
                    href={`/dashboard/equipment/${row.equipment.serial}`}
                    label={row.equipment.flNumber}
                    inspectorName={inspectorName}
                    className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                      isPendingConfirm
                        ? "bg-amber-100 text-amber-700"
                        : "border border-green-200 bg-white text-green-700"
                    }`}
                  />
                )
              })}
            </div>
          )}
        </div>
        <div className="relative rounded-lg border border-gray-300 bg-gray-50 p-3 pb-6 shadow-sm">
          <p className="pb-1.5 text-sm font-semibold text-gray-700">
            Not Yet Inspected ({notInspected.length}/{rows.length})
          </p>
          {notInspected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-gray-200 pt-2">
              {notInspected.map((row) => (
                <a
                  key={row.equipment.serial}
                  href={`/dashboard/equipment/${row.equipment.serial}`}
                  className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                    row.stage === "unresolved"
                      ? "bg-red-100 text-red-700"
                      : row.stage === "pending-confirm"
                        ? "bg-amber-100 text-amber-700"
                        : "border border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {row.equipment.flNumber}
                </a>
              ))}
            </div>
          )}
          {notInspected.some((row) => row.stage === "unresolved" || row.stage === "pending-confirm") && (
            <div className="absolute bottom-1.5 right-2 flex items-center gap-2 text-[10px] font-medium text-gray-400">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                inspection requested
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                needs attention
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EquipmentCard({
  row: { equipment, latest, stage, since },
  today,
  todayDisplay,
}: {
  row: EquipmentRow
  today: string
  todayDisplay: string
}) {
  const hasPhotos = (latest?.inspection._count?.photos ?? 0) > 0
  const daysPassed = since ? daysPassedCount(since, today) : 0

  return (
    <Link
      href={`/dashboard/equipment/${equipment.serial}`}
      className={`relative flex items-start gap-1.5 rounded-lg border bg-white p-4 transition-colors duration-100 active:bg-gray-50 ${
        stage === "unresolved" ? "border-red-300" : "border-gray-300"
      }`}
    >
      <span className="mt-1">
        <StatusDot stage={stage} size="lg" />
      </span>
      <div className="w-full">
        <p
          className={`text-sm font-semibold text-gray-900 ${hasPhotos ? "pr-6" : ""}`}
        >
          {equipment.makeColor} · {equipmentTypeLabel(equipment.type)} · {equipment.flNumber}
        </p>

        <div className="mt-1.5 space-y-1 text-sm text-gray-600">
          <p>
            <span className="text-gray-400">Serial:</span> {equipment.serial}
          </p>
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-gray-400">Location:</span>
            {isUnderRepair(equipment.location) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-800">
                🛠️ Under Repair
              </span>
            ) : (
              equipment.location
            )}
          </p>
          {latest ? (
            <>
              <p>
                <span className="text-gray-400">Inspected:</span>{" "}
                {latest.inspection.date === today ? (
                  <span className="font-semibold text-gray-900">
                    Today, {todayDisplay}
                  </span>
                ) : (
                  latest.inspection.date
                )}{" "}
                · {latest.inspection.shift}
              </p>
              <p>
                <span className="text-gray-400">By:</span>{" "}
                {latest.inspection.firstName} {latest.inspection.lastName}
              </p>
            </>
          ) : (
            <p>
              <span className="text-gray-400">Inspected:</span> No inspection yet
            </p>
          )}
        </div>
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

      {hasPhotos && (
        <span
          title="Photo attached (latest inspection)"
          className="absolute right-4 top-4 text-gray-400"
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

      {since && (
        <p className="absolute bottom-4 right-4 animate-[status-blink_3s_ease-in-out_infinite] text-right text-xs font-semibold leading-tight text-red-600">
          {daysPassed} day{daysPassed === 1 ? "" : "s"}
          <br />
          passed
        </p>
      )}
    </Link>
  )
}

// Shared between the header row and every data row so columns line up —
// kept as one literal string, duplicated into EquipmentBrowser.tsx, since
// the two live in different components with no cheap way to share a
// Tailwind arbitrary-value class across a server/client boundary.
const EQUIPMENT_TABLE_COLS = "grid-cols-6"

const STAGE_LABEL: Record<Stage | "none", string> = {
  unresolved: "Unresolved",
  "pending-confirm": "Needs Attention",
  confirmed: "Confirmed",
  clean: "Clean",
  none: "Not Inspected",
}

function EquipmentTableRow({ row }: { row: EquipmentRow }) {
  const { equipment, latest, stage } = row
  return (
    <Link
      href={`/dashboard/equipment/${equipment.serial}`}
      className={`grid ${EQUIPMENT_TABLE_COLS} items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm transition-colors duration-100 last:border-b-0 hover:bg-gray-50 ${
        stage === "unresolved" ? "bg-red-50" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <StatusDot stage={stage} />
        <span className="truncate text-xs text-gray-600">{STAGE_LABEL[stage]}</span>
      </span>
      <span className="truncate text-center font-medium text-gray-900">
        {equipment.makeColor}
      </span>
      <span className="truncate text-center text-gray-600">
        {equipmentTypeLabel(equipment.type)}
      </span>
      <span className="truncate text-center font-medium text-gray-700">
        {equipment.flNumber}
      </span>
      <span className="truncate text-center text-gray-600">
        {latest ? latest.inspection.date : "—"}
      </span>
      <span className="truncate text-center text-gray-600">
        {latest ? `${latest.inspection.firstName} ${latest.inspection.lastName}` : "—"}
      </span>
    </Link>
  )
}

const ISSUE_PREVIEW_COUNT = 3


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

