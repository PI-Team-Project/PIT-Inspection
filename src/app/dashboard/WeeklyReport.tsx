import { Fragment } from "react"
import Link from "next/link"
import type { Stage } from "@/lib/review"

type WeeklyRow = {
  serial: string
  flNumber: string
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

export default function WeeklyReport({
  weekDays,
  rows,
  todayKey,
  prevWeekHref,
  nextWeekHref,
}: {
  weekDays: string[]
  rows: WeeklyRow[]
  todayKey: string
  prevWeekHref: string
  nextWeekHref: string | null
}) {
  if (rows.length === 0) return null

  const dayLabels = weekDays.map((dateKey) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      day: "numeric",
    }).format(new Date(`${dateKey}T00:00:00Z`))
  )

  return (
    <div className="rounded-lg border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
        <div className="flex flex-1 items-center justify-center gap-1">
          <Link
            href={prevWeekHref}
            aria-label="Previous week"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
          >
            ‹
          </Link>
          <p className="text-sm font-semibold text-gray-700">Weekly Report</p>
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
        <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400">
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 w-16 border-b border-r border-gray-200 bg-gray-50 px-1.5 py-1 text-left text-[10px] font-semibold text-gray-600 sm:w-24 sm:text-xs"
              >
                FL#
              </th>
              {weekDays.map((dateKey, i) => (
                <th
                  key={dateKey}
                  colSpan={2}
                  className={`border-b border-l border-gray-200 px-1 py-1 text-center text-[9px] font-semibold sm:text-xs ${
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
                  <th className="border-l border-gray-200 bg-gray-50 py-0.5 text-center text-[8px] font-medium text-gray-400 sm:text-[10px]">
                    D
                  </th>
                  <th className="border-gray-200 bg-gray-50 py-0.5 text-center text-[8px] font-medium text-gray-400 sm:text-[10px]">
                    N
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.serial}>
                <td className="sticky left-0 z-10 h-7 truncate border-r border-t border-gray-200 bg-white p-0 text-[10px] font-medium sm:h-8 sm:text-xs">
                  <Link
                    href={`/dashboard/equipment/${row.serial}`}
                    className="flex h-full items-center truncate px-1.5 text-brand underline-offset-2 active:bg-gray-50 active:underline"
                  >
                    {row.flNumber}
                  </Link>
                </td>
                {row.cells.map((cell, i) => (
                  <Fragment key={i}>
                    <td
                      className={`h-7 w-6 border-l border-t border-gray-200 text-center text-[10px] leading-none font-bold text-white sm:h-8 sm:w-8 sm:text-xs ${CELL_COLOR[cell.day]}`}
                    >
                      {CELL_GLYPH[cell.day]}
                    </td>
                    <td
                      className={`h-7 w-6 border-t border-gray-200 text-center text-[10px] leading-none font-bold text-white sm:h-8 sm:w-8 sm:text-xs ${CELL_COLOR[cell.night]}`}
                    >
                      {CELL_GLYPH[cell.night]}
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
