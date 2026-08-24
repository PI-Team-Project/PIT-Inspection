"use client"

import { Fragment, useRef, useState } from "react"
import Link from "next/link"
import type { Stage } from "@/lib/review"
import {
  LOCATIONS,
  REPAIR_LOCATION,
  equipmentTypeLabel,
  type Location,
  type EquipmentType,
} from "@/lib/equipment"

// "Repairing 🛠️" is the longest location name and the emoji eats width for
// no informational gain in this cramped column — shortened for display only,
// everywhere else (the location picker, etc.) still shows the full name.
function groupLabelText(groupBy: GroupBy, label: string): string {
  return groupBy === "location" && label === REPAIR_LOCATION ? "Repair" : label
}

type WeeklyCellData = { stage: Stage | "none"; inspectorName: string | null }

type WeeklyRow = {
  serial: string
  flNumber: string
  location: Location
  type: EquipmentType
  cells: { day: WeeklyCellData; night: WeeklyCellData }[]
}

const CELL_COLOR: Record<Stage | "none", string> = {
  unresolved: "bg-red-500",
  "pending-confirm": "bg-yellow-400",
  confirmed: "bg-green-500",
  clean: "bg-green-500",
  // A pure white fill made the white grid border between cells vanish on
  // any empty stretch — a faint gray keeps the same border visible as a
  // real line everywhere, not just between colored cells.
  none: "bg-gray-50",
}

// Only the severe case gets a glyph now — a full grid of ✓/? on every good
// cell read as visual noise once there's a real month of data. Unresolved
// (red) keeps "!" since that's the one state that must never be missed.
const CELL_GLYPH: Record<Stage | "none", string> = {
  unresolved: "!",
  "pending-confirm": "",
  confirmed: "",
  clean: "",
  none: "",
}

// Mouse hover reveals the name instantly via CSS group-hover — no delay,
// unlike the browser's native `title` tooltip. Touch has no hover state at
// all, so the pointer type of the actual tap (captured on pointerdown)
// decides there: the first tap reveals instead of navigating, the second
// tap (now that it's already revealed) goes through. The name floats in an
// absolutely-positioned tooltip rather than growing the cell — these boxes
// are fixed-size and must stay that way regardless of what's shown inside
// them.
function WeeklyCell({
  href,
  stage,
  inspectorName,
}: {
  href: string | null
  stage: Stage | "none"
  inspectorName: string | null
}) {
  const [revealed, setRevealed] = useState(false)
  const lastPointerType = useRef("mouse")

  if (!href) return <>{CELL_GLYPH[stage]}</>

  function handlePointerDown(e: React.PointerEvent<HTMLAnchorElement>) {
    lastPointerType.current = e.pointerType
  }

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (lastPointerType.current === "mouse") return
    if (!revealed) {
      e.preventDefault()
      setRevealed(true)
    }
  }

  return (
    <Link
      href={href}
      title={inspectorName ? `Inspected by ${inspectorName}` : undefined}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className="group relative flex h-full w-full items-center justify-center"
    >
      {CELL_GLYPH[stage]}
      {inspectorName && (
        <span
          className={`pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 -translate-x-1/2 rounded bg-gray-900 px-1.5 py-0.5 text-[10px] leading-tight font-normal whitespace-nowrap normal-case text-white shadow-lg ${
            revealed ? "block" : "hidden group-hover:block"
          }`}
        >
          {inspectorName}
        </span>
      )}
    </Link>
  )
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

// Strips an optional leading single-letter prefix ("S-", "R-", "M-", "P-")
// and the trailing serial number from an FL#, leaving just its model line
// (e.g. "M-MIT-0270" and "R-MIT-0348" both reduce to "MIT") — the thing
// that actually makes rows feel "organized" within a group, rather than
// scattered by whichever prefix letter a given vehicle happens to carry.
function flModelLine(flNumber: string): string {
  return flNumber.replace(/^[A-Za-z]-/, "").replace(/-?\d+$/, "")
}

function byModelLineThenFlNumber(a: WeeklyRow, b: WeeklyRow): number {
  const lineDiff = flModelLine(a.flNumber).localeCompare(flModelLine(b.flNumber))
  if (lineDiff !== 0) return lineDiff
  return a.flNumber.localeCompare(b.flNumber, undefined, { numeric: true })
}

// Same rows, same columns, same everything — grouping only changes the sort
// order and what the merged left-hand label reads. Nothing collapses and
// nothing re-shapes, since jumping between "reorganized" and "collapsed
// and I have to reopen every group" was exactly the complaint before this.
function groupRows(
  rows: WeeklyRow[],
  groupBy: GroupBy
): { label: string; category: "Forklift" | null; rows: WeeklyRow[] }[] {
  if (groupBy === "location") {
    return LOCATIONS.map((location) => ({
      label: location,
      category: null,
      rows: rows.filter((row) => row.location === location).sort(byModelLineThenFlNumber),
    })).filter((g) => g.rows.length > 0)
  }
  return TYPE_ORDER.map((type) => ({
    label: equipmentTypeLabel(type),
    // "Sit Down"/"Propane"/"Standup" are all forklift subtypes — tagging
    // them makes that relationship visible per-box instead of only in the
    // toggle's own "By Type" label.
    category: (type === "Pallet Jack" ? null : "Forklift") as "Forklift" | null,
    rows: rows.filter((row) => row.type === type).sort(byModelLineThenFlNumber),
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
  // Desktop-only hover cue: encodes either scope in one value so a single
  // state variable drives both "highlight this one row" (hovering its FL#)
  // and "highlight every row in this group" (hovering the group label).
  // Declared before the early return below — hooks can't be conditional.
  const [hovered, setHovered] = useState<{ kind: "row" | "group"; key: string } | null>(null)
  // The day-column highlight is deliberately a separate, click/tap-toggled
  // state rather than another hover — hover doesn't exist on touch at all,
  // so this is the one of the three that actually works on mobile. Kept
  // independent of `hovered` so a mouse moving across rows elsewhere never
  // clears a day someone tapped to select.
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  if (rows.length === 0) return null

  const isRowHighlighted = (row: WeeklyRow, groupLabel: string) =>
    hovered !== null &&
    ((hovered.kind === "row" && hovered.key === row.serial) ||
      (hovered.kind === "group" && hovered.key === groupLabel))
  // A translucent gray shadow layered on top of whatever's already there —
  // never a background swap — so a red/yellow/green cell stays exactly its
  // own color (just slightly darkened) instead of being hidden, and an
  // empty cell just reads as a faintly darker gray. Same treatment either
  // way the data looks: mostly filled or mostly empty.
  const HIGHLIGHT = "shadow-[inset_0_0_0_999px_rgba(107,114,128,0.16)]"

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
            scroll={false}
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
              scroll={false}
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
        {/* table-fixed is load-bearing: in the default auto layout, an
            explicit width on a cell is only a hint — the browser still
            grows a column to fit its widest content (e.g. "MI2 Electrode"),
            which is exactly why the table could render a different width
            depending on grouping. Fixed layout makes every column's width
            authoritative, so truncate can actually clip long labels
            instead of silently being overridden. */}
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 w-20 border-b border-r border-gray-200 bg-gray-50 px-1.5 py-1 text-left text-xs font-semibold text-gray-600 sm:w-28 sm:text-sm"
              >
                {groupBy === "location" ? "Loc" : "Type"}
              </th>
              <th
                rowSpan={2}
                className="sticky left-20 z-10 w-24 border-b border-r border-gray-200 bg-gray-50 px-1.5 py-1 text-center text-xs font-semibold text-gray-600 sm:left-28 sm:w-24 sm:text-sm"
              >
                FL#
              </th>
              {weekDays.map((dateKey, i) => (
                <th
                  key={dateKey}
                  colSpan={2}
                  onClick={() => setSelectedDay((prev) => (prev === dateKey ? null : dateKey))}
                  // Click/tap-toggle, not hover — this is the one of these
                  // highlight features that actually works on mobile, since
                  // a tap is a click. Click the same day again to clear it.
                  className={`cursor-pointer border-b border-l border-gray-200 px-1 py-1 text-center text-[10px] font-semibold sm:text-sm ${
                    dateKey === todayKey ? "bg-brand/10 text-brand" : "bg-gray-50 text-gray-600"
                  } ${selectedDay === dateKey ? HIGHLIGHT : ""}`}
                >
                  {dayLabels[i]}
                </th>
              ))}
            </tr>
            <tr>
              {weekDays.map((dateKey) => (
                <Fragment key={dateKey}>
                  <th
                    onClick={() => setSelectedDay((prev) => (prev === dateKey ? null : dateKey))}
                    className={`cursor-pointer border-l border-gray-200 py-0.5 text-center text-[9px] font-medium sm:text-xs ${
                      dateKey === todayKey ? "bg-brand/10 text-brand" : "bg-gray-50 text-gray-400"
                    } ${selectedDay === dateKey ? HIGHLIGHT : ""}`}
                  >
                    D
                  </th>
                  <th
                    onClick={() => setSelectedDay((prev) => (prev === dateKey ? null : dateKey))}
                    className={`cursor-pointer border-gray-200 py-0.5 text-center text-[9px] font-medium sm:text-xs ${
                      dateKey === todayKey ? "bg-brand/10 text-brand" : "bg-gray-50 text-gray-400"
                    } ${selectedDay === dateKey ? HIGHLIGHT : ""}`}
                  >
                    N
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) =>
              g.rows.map((row, i) => {
                const groupHighlighted = hovered?.kind === "group" && hovered.key === g.label
                const rowHighlighted = isRowHighlighted(row, g.label)
                return (
                <tr key={row.serial}>
                  {i === 0 && (
                    <td
                      rowSpan={g.rows.length}
                      title={g.category ? `${g.category} — ${g.label}` : g.label}
                      onMouseEnter={() => setHovered({ kind: "group", key: g.label })}
                      onMouseLeave={() => setHovered(null)}
                      // Width must be fixed HERE too, not just on the <th> —
                      // in an auto-layout table a column's rendered width
                      // comes from whichever cell (header or body) needs
                      // the most room, so a long location name like "MI2
                      // Electrode" could widen the whole table beyond what
                      // "By Type" ever needs, unless every cell in the
                      // column agrees on the same fixed width.
                      className={`sticky left-0 z-10 w-20 border-r border-t border-gray-200 bg-white px-1.5 py-1 align-top text-xs font-medium text-gray-500 sm:w-28 sm:text-sm ${
                        groupHighlighted ? HIGHLIGHT : ""
                      }`}
                    >
                      {/* The category line costs almost no height (leading-none,
                          8px) specifically so a group needs the same minimum
                          row height either grouping — every real group here has
                          3+ rows, comfortably more than this ever needs, so
                          the table's shape stays identical to By Location's. */}
                      {g.category && (
                        <span className="block truncate text-[8px] leading-none font-bold tracking-wide text-brand uppercase">
                          {g.category}
                        </span>
                      )}
                      <span className="block leading-tight whitespace-normal">
                        {groupLabelText(groupBy, g.label)}
                      </span>
                    </td>
                  )}
                  <td
                    onMouseEnter={() => setHovered({ kind: "row", key: row.serial })}
                    onMouseLeave={() => setHovered(null)}
                    className={`sticky left-20 z-10 h-7 w-24 truncate border-r border-t border-gray-200 bg-white p-0 text-xs font-medium sm:left-28 sm:h-8 sm:w-24 sm:text-sm ${
                      rowHighlighted ? HIGHLIGHT : ""
                    }`}
                  >
                    <Link
                      href={`/dashboard/equipment/${row.serial}`}
                      className="flex h-full items-center justify-center truncate px-1.5 text-brand underline-offset-2 active:bg-gray-50 active:underline"
                    >
                      {row.flNumber}
                    </Link>
                  </td>
                  {row.cells.map((cell, ci) => {
                    const dayColumnSelected = selectedDay === weekDays[ci]
                    return (
                    <Fragment key={ci}>
                      <td
                        className={`h-7 w-6 border-2 border-white p-0 text-center align-middle text-sm leading-none font-bold text-white sm:h-8 sm:w-7 sm:text-base ${CELL_COLOR[cell.day.stage]} ${
                          rowHighlighted || dayColumnSelected ? HIGHLIGHT : ""
                        }`}
                      >
                        <WeeklyCell
                          href={
                            cell.day.stage !== "none"
                              ? `/dashboard/equipment/${row.serial}?date=${weekDays[ci]}&shift=Day#selected-inspection`
                              : null
                          }
                          stage={cell.day.stage}
                          inspectorName={cell.day.inspectorName}
                        />
                      </td>
                      <td
                        className={`h-7 w-6 border-2 border-white p-0 text-center align-middle text-sm leading-none font-bold text-white sm:h-8 sm:w-7 sm:text-base ${CELL_COLOR[cell.night.stage]} ${
                          rowHighlighted || dayColumnSelected ? HIGHLIGHT : ""
                        }`}
                      >
                        <WeeklyCell
                          href={
                            cell.night.stage !== "none"
                              ? `/dashboard/equipment/${row.serial}?date=${weekDays[ci]}&shift=Night#selected-inspection`
                              : null
                          }
                          stage={cell.night.stage}
                          inspectorName={cell.night.inspectorName}
                        />
                      </td>
                    </Fragment>
                    )
                  })}
                </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
