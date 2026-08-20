import { Fragment } from "react"
import Link from "next/link"
import type { Stage } from "@/lib/review"
import { LOCATIONS, equipmentTypeLabel, type Location, type EquipmentType } from "@/lib/equipment"

type WeeklyRow = {
  serial: string
  flNumber: string
  location: Location
  type: EquipmentType
  cells: { day: Stage | "none"; night: Stage | "none" }[]
}

const CELL_COLOR: Record<Stage | "none", string> = {
  unresolved: "bg-red-500",
  "pending-confirm": "bg-yellow-400",
  confirmed: "bg-green-500",
  clean: "bg-green-500",
  none: "bg-white",
}

// Color alone shouldn't carry the meaning here — a glyph on top means the
// grid still reads correctly for colorblind viewers, not just at a glance.
const CELL_GLYPH: Record<Stage | "none", string> = {
  unresolved: "!",
  "pending-confirm": "?",
  confirmed: "✓",
  clean: "✓",
  none: "",
}

const TYPE_ORDER: EquipmentType[] = ["Sit Down", "Propane", "Standup", "Pallet Jack"]

function formatWeekRange(startKey: string, endKey: string): string {
  const start = new Date(`${startKey}T00:00:00Z`)
  const end = new Date(`${endKey}T00:00:00Z`)
  const month = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" }).format(d)
  const startMonth = month(start)
  const endMonth = month(end)
  return startMonth === endMonth
    ? `${startMonth} ${start.getUTCDate()}–${end.getUTCDate()}`
    : `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}`
}

type GroupBy = "location" | "type"

// Same rows, same columns, same everything — grouping only changes the sort
// order and what the merged left-hand label reads. Nothing collapses and
// nothing re-shapes, since jumping between "reorganized" and "collapsed
// and I have to reopen every group" was exactly the complaint before this.
function groupRows(rows: WeeklyRow[], groupBy: GroupBy): { label: string; rows: WeeklyRow[] }[] {
  if (groupBy === "location") {
    return LOCATIONS.map((location) => ({
      label: location,
      rows: rows.filter((row) => row.location === location),
    })).filter((g) => g.rows.length > 0)
  }
  return TYPE_ORDER.map((type) => ({
    label: equipmentTypeLabel(type),
    rows: rows.filter((row) => row.type === type),
  })).filter((g) => g.rows.length > 0)
}

export default function WeeklyReport({
  weekDays,
  rows,
  todayKey,
  prevWeekHref,
  nextWeekHref,
  groupBy,
  locationHref,
  typeHref,
}: {
  weekDays: string[]
  rows: WeeklyRow[]
  todayKey: string
  prevWeekHref: string
  nextWeekHref: string | null
  groupBy: GroupBy
  locationHref: string
  typeHref: string
}) {
  if (rows.length === 0) return null

  const dayLabels = weekDays.map((dateKey) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
    }).format(new Date(`${dateKey}T00:00:00Z`))
  )
  const weekRangeLabel = formatWeekRange(weekDays[0], weekDays[6])
  const groups = groupRows(rows, groupBy)

  return (
    <div className="rounded-lg border border-gray-200 shadow-sm">
      <div className="border-b border-gray-200 px-3 py-2.5">
        <div className="flex items-center justify-center gap-4">
          <Link
            href={prevWeekHref}
            aria-label="Previous week"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
          >
            ‹
          </Link>
          <p className="text-sm font-semibold text-gray-700">
            Weekly Report · {weekRangeLabel}
          </p>
          {nextWeekHref ? (
            <Link
              href={nextWeekHref}
              aria-label="Next week"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
            >
              ›
            </Link>
          ) : (
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-200"
            >
              ›
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5 text-[10px] font-medium">
            <Link
              href={locationHref}
              scroll={false}
              className={`rounded px-2 py-0.5 ${
                groupBy === "location" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              By Location
            </Link>
            <Link
              href={typeHref}
              scroll={false}
              className={`rounded px-2 py-0.5 ${
                groupBy === "type" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              By Type
            </Link>
          </div>
          <div className="flex flex-nowrap items-center gap-3 text-[10px] font-medium whitespace-nowrap text-gray-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-green-500" />
              Clean
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-yellow-400" />
              Attention
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-red-500" />
              Unresolved
            </span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 w-14 border-b border-r border-gray-200 bg-gray-50 px-1.5 py-1 text-left text-xs font-semibold text-gray-600 sm:w-20 sm:text-sm"
              >
                {groupBy === "location" ? "Loc" : "Type"}
              </th>
              <th
                rowSpan={2}
                className="sticky left-14 z-10 w-16 border-b border-r border-gray-200 bg-gray-50 px-1.5 py-1 text-left text-xs font-semibold text-gray-600 sm:left-20 sm:w-24 sm:text-sm"
              >
                FL#
              </th>
              {weekDays.map((dateKey, i) => (
                <th
                  key={dateKey}
                  colSpan={2}
                  className={`border-b border-l border-gray-200 px-1 py-1 text-center text-[10px] font-semibold sm:text-sm ${
                    dateKey === todayKey ? "bg-brand/10 text-brand" : "bg-gray-50 text-gray-600"
                  }`}
                >
                  {dayLabels[i]}
                </th>
              ))}
            </tr>
            <tr>
              {weekDays.map((dateKey) => (
                <Fragment key={dateKey}>
                  <th className="border-l border-gray-200 bg-gray-50 py-0.5 text-center text-[9px] font-medium text-gray-400 sm:text-xs">
                    D
                  </th>
                  <th className="border-gray-200 bg-gray-50 py-0.5 text-center text-[9px] font-medium text-gray-400 sm:text-xs">
                    N
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              g.rows.map((row, i) => (
                <tr key={row.serial}>
                  {i === 0 && (
                    <td
                      rowSpan={g.rows.length}
                      title={g.label}
                      className="sticky left-0 z-10 truncate border-r border-t border-gray-200 bg-white px-1.5 py-1 align-top text-xs font-medium text-gray-500 sm:text-sm"
                    >
                      {g.label}
                    </td>
                  )}
                  <td className="sticky left-14 z-10 h-7 truncate border-r border-t border-gray-200 bg-white p-0 text-xs font-medium sm:left-20 sm:h-8 sm:text-sm">
                    <Link
                      href={`/dashboard/equipment/${row.serial}`}
                      className="flex h-full items-center truncate px-1.5 text-brand underline-offset-2 active:bg-gray-50 active:underline"
                    >
                      {row.flNumber}
                    </Link>
                  </td>
                  {row.cells.map((cell, ci) => (
                    <Fragment key={ci}>
                      <td
                        className={`h-7 w-6 border-l border-t border-gray-200 p-0 text-center align-middle text-sm leading-none font-bold text-white sm:h-8 sm:w-8 sm:text-base ${CELL_COLOR[cell.day]}`}
                      >
                        {cell.day !== "none" ? (
                          <Link
                            href={`/dashboard/equipment/${row.serial}?date=${weekDays[ci]}&shift=Day#highlighted-inspection`}
                            className="flex h-full w-full items-center justify-center"
                          >
                            {CELL_GLYPH[cell.day]}
                          </Link>
                        ) : (
                          CELL_GLYPH[cell.day]
                        )}
                      </td>
                      <td
                        className={`h-7 w-6 border-t border-gray-200 p-0 text-center align-middle text-sm leading-none font-bold text-white sm:h-8 sm:w-8 sm:text-base ${CELL_COLOR[cell.night]}`}
                      >
                        {cell.night !== "none" ? (
                          <Link
                            href={`/dashboard/equipment/${row.serial}?date=${weekDays[ci]}&shift=Night#highlighted-inspection`}
                            className="flex h-full w-full items-center justify-center"
                          >
                            {CELL_GLYPH[cell.night]}
                          </Link>
                        ) : (
                          CELL_GLYPH[cell.night]
                        )}
                      </td>
                    </Fragment>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
