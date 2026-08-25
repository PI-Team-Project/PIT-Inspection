"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import type { Stage } from "@/lib/review"

export type LogEntry = {
  id: string
  date: string
  shift: "Day" | "Night"
  inspectorName: string
  stage: Stage
  // What was actually flagged (e.g. "Horn", "Repair Request"), so scanning
  // the log tells you what's wrong without clicking into every red row.
  issueSummary: string | null
}

// `confirmed` (had an issue, got flagged, then fixed and signed off) used to
// look identical to `clean` (never had an issue) everywhere here — there
// was no way to tell "resolved" apart from "was never a problem" without
// opening every single green row. Blue reads clearly as its own category
// next to the red/yellow/green trio, rather than blending in as a dark
// shade of "good" the way teal did.
const STAGE_COLOR: Record<Stage, string> = {
  unresolved: "bg-red-500",
  "pending-confirm": "bg-yellow-400",
  confirmed: "bg-blue-500",
  clean: "bg-green-500",
}

const STAGE_GLYPH: Record<Stage, string> = {
  unresolved: "!",
  "pending-confirm": "?",
  confirmed: "✓",
  clean: "✓",
}

const STAGE_LABEL: Record<Stage, string> = {
  unresolved: "Unresolved",
  "pending-confirm": "Needs attention",
  confirmed: "Resolved",
  clean: "Clean",
}

const PAGE_SIZE = 20
type View = "calendar" | "issues" | "log"
const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "calendar", label: "Calendar", icon: "📅" },
  { key: "issues", label: "Issues Only", icon: "⚠️" },
  { key: "log", label: "Full Log", icon: "📋" },
]

function addMonths(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number)
  const total = y * 12 + (m - 1) + delta
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number)
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  )
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// Monday-first, matching the Weekly Report's week convention elsewhere on
// this page — 0 = Monday .. 6 = Sunday.
function firstWeekdayOfMonth(y: number, m: number): number {
  const jsDay = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  return (jsDay + 6) % 7
}

function StageDot({ href, stage }: { href: string | null; stage?: Stage }) {
  const color = stage ? STAGE_COLOR[stage] : "bg-gray-200"
  if (!href) return <span className={`h-2 w-2 rounded-full ${color}`} />
  return (
    <Link
      href={href}
      className={`block h-2 w-2 rounded-full transition-transform duration-100 hover:scale-125 active:scale-90 ${color}`}
    />
  )
}

function CalendarView({
  serial,
  todayKey,
  entriesByDate,
}: {
  serial: string
  todayKey: string
  entriesByDate: Map<string, Partial<Record<"Day" | "Night", LogEntry>>>
}) {
  const [monthKey, setMonthKey] = useState(() => {
    const mostRecent = [...entriesByDate.keys()].sort().at(-1)
    return (mostRecent ?? todayKey).slice(0, 7)
  })
  const [y, m] = monthKey.split("-").map(Number)
  const numDays = daysInMonth(y, m)
  const leadingBlanks = firstWeekdayOfMonth(y, m)
  const cells: (string | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: numDays }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`),
  ]
  const isCurrentMonth = monthKey >= todayKey.slice(0, 7)

  return (
    <div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setMonthKey((k) => addMonths(k, -1))}
          aria-label="Previous month"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-gray-700">{monthLabel(monthKey)}</p>
        {isCurrentMonth ? (
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-200"
          >
            ›
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setMonthKey((k) => addMonths(k, 1))}
            aria-label="Next month"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
          >
            ›
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-gray-400">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((dateKey, i) => {
          if (!dateKey) return <div key={`b${i}`} />
          const entry = entriesByDate.get(dateKey)
          return (
            <div
              key={dateKey}
              className={`rounded-md border p-1 text-center ${
                dateKey === todayKey ? "border-brand bg-brand/5" : "border-gray-100"
              }`}
            >
              {entry?.Day || entry?.Night ? (
                // No shift on this link — the date represents the whole
                // day, and the equipment page shows every inspection that
                // happened that day together (Day and Night both, when both
                // exist) rather than forcing a pick of just one.
                <Link
                  href={`/dashboard/equipment/${serial}?date=${dateKey}#selected-inspection`}
                  className="block text-[10px] font-medium text-gray-500 hover:text-brand hover:underline"
                >
                  {Number(dateKey.slice(-2))}
                </Link>
              ) : (
                <p className="text-[10px] text-gray-400">{Number(dateKey.slice(-2))}</p>
              )}
              <div className="mt-0.5 flex items-center justify-center gap-0.5">
                <StageDot
                  href={
                    entry?.Day
                      ? `/dashboard/equipment/${serial}?date=${dateKey}&shift=Day#selected-inspection`
                      : null
                  }
                  stage={entry?.Day?.stage}
                />
                <StageDot
                  href={
                    entry?.Night
                      ? `/dashboard/equipment/${serial}?date=${dateKey}&shift=Night#selected-inspection`
                      : null
                  }
                  stage={entry?.Night?.stage}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] font-medium text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" /> Clean
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" /> Resolved
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-yellow-400" /> Attention
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" /> Unresolved
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gray-200" /> No inspection
        </span>
      </div>
    </div>
  )
}

function LogTable({
  serial,
  rows,
  emptyLabel,
}: {
  serial: string
  rows: LogEntry[]
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return <p className="px-3 py-6 text-center text-sm text-gray-500">{emptyLabel}</p>
  }
  // One shared grid for the header AND every row (instead of a separate
  // grid per row) so the same column ever only gets sized once — otherwise
  // each row's Date/Shift columns size to that row's own content alone and
  // drift out of alignment with the header and with each other. Date,
  // Shift, and Inspector all carry an `fr` share (with a `minmax` floor so
  // they never shrink below what their own content needs) so extra width
  // on a wide screen spreads across all three proportionally, instead of
  // only Inspector stretching while Status ends up stranded far to the
  // right with a dead gap in front of it. Status/chevron stay fixed —
  // they're icon-sized and have no reason to grow. Each Link uses
  // `contents` so its cells become direct grid items (grid only
  // auto-aligns direct children) while staying one clickable row.
  return (
    <div className="grid grid-cols-[minmax(7.5rem,1fr)_minmax(3.5rem,0.5fr)_minmax(0,3fr)_auto_auto] gap-y-0">
      <span className="bg-gray-50 py-1.5 pr-8 pl-3 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
        Date
      </span>
      <span className="bg-gray-50 py-1.5 pr-4 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
        Shift
      </span>
      <span className="bg-gray-50 py-1.5 pr-4 text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
        Inspector
      </span>
      <span className="bg-gray-50 py-1.5 pr-3 text-center text-[10px] font-semibold tracking-wide text-gray-500 uppercase">
        Status
      </span>
      <span className="bg-gray-50 py-1.5 pr-2" />
      {rows.map((r) => (
        <Link
          key={r.id}
          href={`/dashboard/equipment/${serial}?date=${r.date}&shift=${r.shift}#selected-inspection`}
          className="group contents"
        >
          <span className="border-t border-gray-100 py-2 pr-8 pl-3 text-sm whitespace-nowrap text-gray-700 transition-colors duration-100 group-hover:bg-gray-50 group-active:bg-gray-100">
            {r.date}
          </span>
          <span className="border-t border-gray-100 py-2 pr-4 text-sm text-gray-500 transition-colors duration-100 group-hover:bg-gray-50 group-active:bg-gray-100">
            {r.shift}
          </span>
          <span className="truncate border-t border-gray-100 py-2 pr-4 text-sm text-gray-700 transition-colors duration-100 group-hover:bg-gray-50 group-active:bg-gray-100">
            {r.inspectorName}
            {r.issueSummary && (
              <span className="text-gray-600" style={{ fontFamily: "'Courier New', monospace" }}>
                {" "}
                · {r.issueSummary}
              </span>
            )}
          </span>
          <span className="flex items-center justify-center border-t border-gray-100 py-2 pr-3 transition-colors duration-100 group-hover:bg-gray-50 group-active:bg-gray-100">
            <span
              title={STAGE_LABEL[r.stage]}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] leading-none font-bold text-white ${STAGE_COLOR[r.stage]}`}
            >
              {STAGE_GLYPH[r.stage]}
            </span>
          </span>
          <span className="flex items-center border-t border-gray-100 py-2 pr-2 text-gray-300 transition-colors duration-100 group-hover:bg-gray-50 group-hover:text-gray-400 group-active:bg-gray-100">
            ›
          </span>
        </Link>
      ))}
    </div>
  )
}

export default function VehicleHistory({
  serial,
  todayKey,
  entries,
}: {
  serial: string
  todayKey: string
  entries: LogEntry[]
}) {
  const [view, setView] = useState<View>("log")
  const [page, setPage] = useState(1)
  const calendarRef = useRef<HTMLDivElement>(null)

  // The Issues/Log tables are already short enough to see right where they
  // are, but the calendar can render below the fold — bring the whole
  // month grid into view as soon as it's picked instead of leaving the
  // visitor to notice and scroll down manually.
  useEffect(() => {
    if (view === "calendar") {
      calendarRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
    }
  }, [view])

  const entriesByDate = useMemo(() => {
    const map = new Map<string, Partial<Record<"Day" | "Night", LogEntry>>>()
    for (const e of entries) {
      const forDate = map.get(e.date) ?? {}
      forDate[e.shift] = e
      map.set(e.date, forDate)
    }
    return map
  }, [entries])

  // "Issues" means any day that was ever a problem — including ones
  // already fixed. Excluding resolved ones defeated the point of being
  // able to track back and see what got caught and cleared over time.
  const filteredRows =
    view === "issues"
      ? entries.filter((e) => e.stage !== "clean")
      : entries
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function changeView(next: View) {
    setView(next)
    setPage(1)
  }

  return (
    // No shadow, lighter border than the status zone above — this is
    // reference material to consult, not the thing demanding attention.
    <div className="rounded-lg border border-gray-100">
      <div className="border-b border-gray-200 px-3 py-2.5">
        <p className="text-center text-sm font-semibold text-gray-700">
          History ({entries.length})
        </p>
        <p className="mt-0.5 mb-2 text-center text-xs text-gray-400">
          Tap a date or row below to view that inspection
        </p>
        <div className="flex gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => changeView(v.key)}
              className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
                view === v.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              <span aria-hidden="true">{v.icon}</span> {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        <div className="p-3">
          <CalendarView serial={serial} todayKey={todayKey} entriesByDate={entriesByDate} />
        </div>
      ) : (
        <>
          <LogTable
            serial={serial}
            rows={pageRows}
            emptyLabel={
              view === "issues"
                ? "No flagged or resolved inspections in this vehicle's history."
                : "No inspections yet."
            }
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="font-medium text-brand disabled:text-gray-300"
              >
                ← Newer
              </button>
              <span className="text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="font-medium text-brand disabled:text-gray-300"
              >
                Older →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
