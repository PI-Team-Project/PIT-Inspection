import Link from "next/link"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { hasDashboardSession } from "@/lib/auth"
import { LOCATIONS, REPAIR_LOCATION, equipmentTypeLabel, type EquipmentType } from "@/lib/equipment"
import { FLEET_TIME_ZONE, easternDateKey, formatClock } from "@/lib/shifts"
import {
  completedShifts,
  computeFleetUsage,
  parseUsageRange,
  usageRangeStart,
  type ShiftUsage,
  type VehicleUsage,
} from "@/lib/fleetUsage"
import DashboardHomeTab from "../DashboardHomeTab"
import DashboardTabs from "../DashboardTabs"
import HomeLink from "../HomeLink"
import LiveClock from "../LiveClock"
import RangeSelect from "./RangeSelect"
import UseLevelTable, { type UseLevelRow } from "./UseLevelTable"
import { FIRST_COL, TABLE, TABLE_WRAP, TD, TH, UsageCell, pct } from "./tableParts"

const TYPE_ORDER: EquipmentType[] = ["Sit Down", "Propane", "Standup", "Pallet Jack"]
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
// Used in fewer than LOW of its shifts → Low Use; in at least HIGH → High Use.
const LOW_USE_RATE = 0.1
const HIGH_USE_RATE = 0.6

function formatDateKey(dateKey: string, withWeekday = false): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

const locationLabel = (location: string) => (location === REPAIR_LOCATION ? "Repair" : location)

export default async function FleetUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  if (!(await hasDashboardSession())) redirect("/dashboard")

  const range = parseUsageRange((await searchParams).range)
  const now = new Date()
  const todayKey = easternDateKey(now)

  const [equipment, firstInspection, lastUsed] = await Promise.all([
    prisma.equipment.findMany({
      where: { retiredAt: null },
      select: { serial: true, flNumber: true, type: true, location: true, contractType: true, createdAt: true },
    }),
    prisma.inspection.aggregate({ _min: { createdAt: true } }),
    // One index lookup per active vehicle on (equipmentSerial, createdAt),
    // instead of a GROUP BY over every inspection kept.
    prisma.$queryRaw<{ serial: string; createdAt: Date }[]>`
      SELECT e.serial, l."createdAt"
      FROM "Equipment" e
      CROSS JOIN LATERAL (
        SELECT i."createdAt" FROM "Inspection" i
        WHERE i."equipmentSerial" = e.serial
        ORDER BY i."createdAt" DESC
        LIMIT 1
      ) l
      WHERE e."retiredAt" IS NULL
    `,
  ])
  const dataStart = firstInspection._min.createdAt
  const startKey = usageRangeStart(range, todayKey, dataStart ? easternDateKey(dataStart) : null)
  const shifts = completedShifts(startKey, todayKey, now)

  const inspections = shifts.length
    ? await prisma.inspection.findMany({
        where: { createdAt: { gte: shifts[0].start, lt: shifts[shifts.length - 1].end } },
        select: { equipmentSerial: true, createdAt: true },
      })
    : []

  const usage = computeFleetUsage(
    shifts,
    equipment.map((eq) => ({
      serial: eq.serial,
      flNumber: eq.flNumber,
      type: eq.type,
      location: eq.location,
      addedKey: easternDateKey(eq.createdAt),
    })),
    inspections,
    { types: TYPE_ORDER, locations: LOCATIONS }
  )
  const lastUsedKey = new Map(
    lastUsed.map((row) => [row.serial, easternDateKey(row.createdAt)])
  )

  const contractOf = new Map(equipment.map((eq) => [eq.serial, eq.contractType]))
  const lastUsedLabel = (serial: string) => {
    const key = lastUsedKey.get(serial)
    return key ? formatDateKey(key) : "Never"
  }
  const toUseLevelRow = (v: VehicleUsage): UseLevelRow => ({
    serial: v.serial,
    flNumber: v.flNumber,
    typeLabel: equipmentTypeLabel(v.type as EquipmentType),
    contract: contractOf.get(v.serial) ?? "",
    location: locationLabel(v.location),
    shiftsUsed: v.shiftsUsed,
    shiftsInFleet: v.shiftsInFleet,
    rate: v.rate,
    lastUsed: lastUsedLabel(v.serial),
  })
  // Low: lowest first, then the one unused the longest. A vehicle in repair
  // is unused for a known reason, so it is not listed.
  const lowUse = usage.vehicles
    .filter((v) => v.shiftsInFleet > 0 && v.rate < LOW_USE_RATE && v.location !== REPAIR_LOCATION)
    .sort(
      (a, b) =>
        a.rate - b.rate || (lastUsedKey.get(a.serial) ?? "").localeCompare(lastUsedKey.get(b.serial) ?? "")
    )
    .map(toUseLevelRow)
  // usage.vehicles is already highest first.
  const highUse = usage.vehicles.filter((v) => v.rate >= HIGH_USE_RATE).map(toUseLevelRow)

  const inRepair = (type?: string) =>
    equipment.filter((eq) => eq.location === REPAIR_LOCATION && (type === undefined || eq.type === type)).length
  // The Total row's peak is the most vehicles used in one shift — the same
  // number as the Peak Shift tile — not the sum of each type's own peak,
  // which fall on different shifts.
  const totalPeak = usage.peak?.used ?? 0
  // Same rule as Low Use: a vehicle in repair is not counted as unused.
  const notUsed = usage.vehicles.filter(
    (v) => v.shiftsInFleet > 0 && v.shiftsUsed === 0 && v.location !== REPAIR_LOCATION
  ).length

  const shiftLabel = (s: ShiftUsage | null) =>
    s ? `${formatDateKey(s.dateKey, true)} · ${s.label}` : "—"
  const rangeLabel = shifts.length
    ? `${formatDateKey(shifts[0].dateKey)} – ${formatDateKey(shifts[shifts.length - 1].dateKey)} · ${shifts.length} shifts`
    : "No completed shifts"

  return (
    <main className="mx-auto max-w-lg px-4 pt-1 pb-8 sm:max-w-2xl lg:max-w-4xl">
      <DashboardHomeTab tucked />
      <div className="flex items-center gap-3">
        <HomeLink />
        <div className="min-w-0">
          <h1>
            <DashboardTabs active="usage" />
          </h1>
          <div className="flex min-w-0 items-baseline gap-1.5 text-xs font-medium text-gray-400">
            <LiveClock timeZone={FLEET_TIME_ZONE} initialLabel={formatClock(FLEET_TIME_ZONE, now)} />
            <span>·</span>
            <span className="truncate">Holland, MI</span>
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-gray-100" />

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-gray-500">{rangeLabel}</p>
        <RangeSelect value={range} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Avg Used per Shift" value={pct(usage.avgRate)}>
          {usage.avgUsed.toFixed(1)} of {usage.fleetSize} vehicles
        </Stat>
        <Stat label="Peak Shift" value={usage.peak ? String(usage.peak.used) : "—"}>
          {shiftLabel(usage.peak)}
        </Stat>
        <Stat label="Lowest Shift" value={usage.low ? String(usage.low.used) : "—"}>
          {shiftLabel(usage.low)}
        </Stat>
        <Stat label="Not Used" value={String(notUsed)}>
          of {usage.fleetSize} vehicles
        </Stat>
      </div>

      <Section title="Vehicles by Type">
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={`${TH} ${FIRST_COL} text-left`}>Type</th>
                <th className={`${TH} text-center`}>Total Vehicles</th>
                <th className={`${TH} text-center`}>Max Used per Shift</th>
                <th className={`${TH} text-center`}>Unused at Peak</th>
                <th className={`${TH} text-center`}>Avg Usage</th>
              </tr>
            </thead>
            <tbody>
              {usage.byType.map((g) => (
                <tr key={g.label}>
                  <td className={`${TD} font-medium text-gray-900`}>
                    {equipmentTypeLabel(g.label as EquipmentType)}
                  </td>
                  <td className={`${TD} text-center tabular-nums text-gray-700`}>
                    <RepairCount total={g.vehicles} repair={inRepair(g.label)} />
                  </td>
                  <td className={`${TD} text-center tabular-nums text-gray-700`}>{g.peak}</td>
                  <td className={`${TD} text-center font-bold tabular-nums text-gray-900`}>
                    {g.vehicles - g.peak}
                  </td>
                  <td className={TD}>
                    <UsageCell rate={g.rate} />
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50">
                <td className={`${TD} font-semibold text-gray-900`}>Total</td>
                <td className={`${TD} text-center font-semibold tabular-nums text-gray-900`}>
                  <RepairCount total={usage.fleetSize} repair={inRepair()} />
                </td>
                <td className={`${TD} text-center font-semibold tabular-nums text-gray-900`}>{totalPeak}</td>
                <td className={`${TD} text-center font-bold tabular-nums text-gray-900`}>
                  {usage.fleetSize - totalPeak}
                </td>
                <td className={TD}>
                  <UsageCell rate={usage.avgRate} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <UseLevelTable
        low={lowUse}
        high={highUse}
        lowLabel={`Under ${pct(LOW_USE_RATE)} of shifts`}
        highLabel={`${pct(HIGH_USE_RATE)}+ of shifts`}
      />

      <Section title="By Weekday">
        <WeekdayGrid grid={usage.weekdayGrid} fleetSize={usage.fleetSize} />
      </Section>

      <Section title="By Location">
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={`${TH} ${FIRST_COL} text-left`}>Location</th>
                <th className={`${TH} text-center`}>Vehicles</th>
                <th className={`${TH} text-center`}>Avg Used per Shift</th>
                <th className={`${TH} text-center`}>Avg Usage</th>
              </tr>
            </thead>
            <tbody>
              {usage.byLocation
                .filter((g) => g.label !== REPAIR_LOCATION)
                .map((g) => (
                  <tr key={g.label}>
                    <td className={`${TD} truncate font-medium text-gray-900`}>{g.label}</td>
                    <td className={`${TD} text-center tabular-nums text-gray-700`}>{g.vehicles}</td>
                    <td className={`${TD} text-center tabular-nums text-gray-700`}>{g.avgUsed.toFixed(1)}</td>
                    <td className={TD}>
                      <UsageCell rate={g.rate} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="By Vehicle">
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={`${TH} ${FIRST_COL} text-left`}>Vehicle</th>
                <th className={`${TH} hidden text-left sm:table-cell`}>Location</th>
                <th className={`${TH} text-center`}>Shifts Used</th>
                <th className={`${TH} text-center`}>Usage</th>
                <th className={`${TH} hidden text-center sm:table-cell`}>Last Used</th>
              </tr>
            </thead>
            <tbody>
              {usage.vehicles.map((v, i) => (
                <tr key={v.serial}>
                  <td className={TD}>
                    <Link
                      href={`/dashboard/equipment/${v.serial}`}
                      className={`block truncate font-medium hover:underline ${
                        v.shiftsUsed === 0 ? "text-gray-400" : "text-gray-900"
                      }`}
                    >
                      <span className="mr-1 hidden w-5 text-[11px] font-normal tabular-nums text-gray-400 sm:inline-block">
                        {i + 1}
                      </span>
                      {v.flNumber}
                    </Link>
                    <span className="block truncate text-[11px] text-gray-400 sm:pl-6">
                      {equipmentTypeLabel(v.type as EquipmentType)}
                    </span>
                  </td>
                  <td className={`${TD} hidden truncate text-gray-700 sm:table-cell`}>
                    {locationLabel(v.location)}
                  </td>
                  <td className={`${TD} text-center tabular-nums text-gray-700`}>
                    {v.shiftsUsed}/{v.shiftsInFleet}
                  </td>
                  <td className={TD}>
                    <UsageCell rate={v.rate} />
                  </td>
                  <td className={`${TD} hidden text-center tabular-nums text-gray-700 sm:table-cell`}>
                    {lastUsedLabel(v.serial)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  )
}

function Stat({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 px-3 py-2.5">
      <p className="truncate text-[11px] font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl leading-none font-bold tracking-tight text-gray-900 tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-gray-500">{children}</p>
    </div>
  )
}

function RepairCount({ total, repair }: { total: number; repair: number }) {
  return (
    <>
      {total}
      {repair > 0 && (
        <span className="block text-[10px] leading-tight font-normal whitespace-nowrap text-amber-700">{repair} repair</span>
      )}
    </>
  )
}

// Same height whether or not a section carries a control in its title row,
// so every section title lines up.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex h-7 items-center text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function WeekdayGrid({
  grid,
  fleetSize,
}: {
  grid: { day: (number | null)[]; night: (number | null)[] }
  fleetSize: number
}) {
  const rows = [
    { label: "Day", values: grid.day },
    { label: "Night", values: grid.night },
  ]
  return (
    <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] gap-1 text-center">
      <span />
      {WEEKDAYS.map((d) => (
        <span key={d} className="text-[11px] font-semibold text-gray-500">
          {d}
        </span>
      ))}
      {rows.map((row) => (
        <Row key={row.label} label={row.label} values={row.values} fleetSize={fleetSize} />
      ))}
    </div>
  )
}

// Cell shade is the share of the fleet used, mixed from the brand colour so
// it reads the same in day and night mode.
function Row({ label, values, fleetSize }: { label: string; values: (number | null)[]; fleetSize: number }) {
  return (
    <>
      <span className="flex items-center pr-2 text-left text-[11px] font-semibold text-gray-500">{label}</span>
      {values.map((value, i) => {
        const share = value === null || fleetSize === 0 ? 0 : value / fleetSize
        return (
          <span
            key={i}
            className="flex h-11 flex-col items-center justify-center rounded border border-gray-200 leading-tight"
            style={
              value === null
                ? undefined
                : { backgroundColor: `color-mix(in srgb, var(--brand) ${Math.round(share * 100)}%, transparent)` }
            }
          >
            <span
              className={`text-sm font-bold tabular-nums ${
                value === null ? "text-gray-300" : share >= 0.45 ? "text-white" : "text-gray-900"
              }`}
            >
              {value === null ? "—" : value.toFixed(1)}
            </span>
            {value !== null && (
              <span className={`text-[10px] tabular-nums ${share >= 0.45 ? "text-white/70" : "text-gray-500"}`}>
                {pct(share)}
              </span>
            )}
          </span>
        )
      })}
    </>
  )
}
