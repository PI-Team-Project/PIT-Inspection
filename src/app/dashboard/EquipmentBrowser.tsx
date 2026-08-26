"use client"

import { useState, type ReactNode } from "react"
import { equipmentTypeLabel, LOCATIONS, type EquipmentType, type Location } from "@/lib/equipment"
import type { Stage } from "@/lib/review"

type Card = {
  serial: string
  type: EquipmentType
  location: Location
  stage: Stage | "none"
  escalated: boolean
  node: ReactNode
  tableRow: ReactNode
}

// Kept in sync by hand with the identical literal in page.tsx's
// EquipmentTableRow — the two live on opposite sides of a server/client
// boundary, so there's no cheap way to share one constant between them.
const TABLE_COLS = "grid-cols-6"

function TableHeaderRow() {
  return (
    <div
      className={`grid ${TABLE_COLS} gap-2 border-b border-gray-300 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500`}
    >
      <span>Status</span>
      <span className="text-center">Title</span>
      <span className="text-center">Type</span>
      <span className="text-center">FL#</span>
      <span className="text-center">Last Inspected</span>
      <span className="text-center">Inspector</span>
    </div>
  )
}

function TypeGroup({
  title,
  rows,
  isOpen,
  onToggle,
}: {
  title: string
  rows: Card[]
  isOpen: boolean
  onToggle: (open: boolean) => void
}) {
  if (rows.length === 0) return null
  return (
    <details
      className="group"
      open={isOpen}
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-brand transition-colors duration-100 hover:bg-gray-50 active:bg-gray-100">
        <span>
          {title} ({rows.length})
        </span>
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
      <div className="space-y-3 border-t border-gray-100 p-3 lg:hidden">
        {rows.map((c) => c.node)}
      </div>
      <div className="hidden border-t border-gray-100 lg:block">
        <TableHeaderRow />
        {rows.map((c) => c.tableRow)}
      </div>
    </details>
  )
}

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

function worstUrgency(cards: Card[]) {
  if (cards.length === 0) return Infinity
  return Math.min(...cards.map((c) => urgencyRank(c.stage, c.escalated)))
}

function byType(cards: Card[], type: EquipmentType) {
  return cards.filter((c) => c.type === type)
}

function byLocation(cards: Card[], location: Location) {
  return cards.filter((c) => c.location === location)
}

type GroupBy = "type" | "location"
type TabValue = "all" | "forklift" | "Pallet Jack" | "red" | "yellow"

// Empty means no filter applied (show every subtype). Clicking a subtype
// adds it to the filter; clicking it again removes it — a plain multi-select.
function toggleSubtype(active: EquipmentType[], type: EquipmentType): EquipmentType[] {
  return active.includes(type) ? active.filter((t) => t !== type) : [...active, type]
}

export default function EquipmentBrowser({ cards }: { cards: Card[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("type")
  const [tab, setTab] = useState<TabValue>("all")
  const [activeSubtypes, setActiveSubtypes] = useState<EquipmentType[]>([])
  const [activeLocation, setActiveLocation] = useState<Location | null>(null)
  // "Open All" / "Close All" bulk-toggle state for every group, plus a
  // per-group override for anyone who's manually opened/closed one on its
  // own — otherwise a single manual toggle would get silently stomped by
  // whatever the bulk state happens to be.
  const [allOpen, setAllOpen] = useState(false)
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({})

  if (cards.length === 0) {
    return <p className="mt-3 text-gray-500">No equipment on file.</p>
  }

  function isGroupOpen(key: string) {
    return openOverrides[key] ?? allOpen
  }

  function toggleGroup(key: string, open: boolean) {
    setOpenOverrides((prev) => ({ ...prev, [key]: open }))
  }

  // Selecting a specific type/location is a request to see it, not just
  // filter down to it — force its own group open so it doesn't take a
  // second click on the (now much shorter) list to actually reveal it.
  function openGroups(keys: string[]) {
    setOpenOverrides((prev) => {
      const next = { ...prev }
      keys.forEach((key) => {
        next[key] = true
      })
      return next
    })
  }

  // Switching axis resets the other axis's own filters — a subtype filter
  // or a single active location are meaningless once you're grouping by
  // the other one.
  function handleGroupByChange(next: GroupBy) {
    setGroupBy(next)
    setTab("all")
    setActiveSubtypes([])
    setActiveLocation(null)
  }

  function handleViewAllClick() {
    if (tab !== "all") {
      setTab("all")
      return
    }
    setAllOpen((prev) => !prev)
    setOpenOverrides({})
  }

  const statusFiltered =
    tab === "red"
      ? cards.filter((c) => c.stage === "unresolved")
      : tab === "yellow"
        ? cards.filter((c) => c.stage === "pending-confirm")
        : cards

  const typedCards =
    groupBy === "location"
      ? activeLocation
        ? statusFiltered.filter((c) => c.location === activeLocation)
        : statusFiltered
      : tab === "forklift"
        ? activeSubtypes.length > 0
          ? statusFiltered.filter((c) => activeSubtypes.includes(c.type))
          : statusFiltered
        : tab === "Pallet Jack"
          ? statusFiltered.filter((c) => c.type === "Pallet Jack")
          : statusFiltered

  const unfiltered = tab === "all"

  const groupByToggle = (
    <div className="mb-2 flex gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
      <button
        type="button"
        onClick={() => handleGroupByChange("type")}
        className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
          groupBy === "type" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
        }`}
      >
        Group by Type
      </button>
      <button
        type="button"
        onClick={() => handleGroupByChange("location")}
        className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
          groupBy === "location" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
        }`}
      >
        Group by Location
      </button>
    </div>
  )

  const statusDots = (
    <>
      <button
        type="button"
        onClick={() => setTab("red")}
        aria-label="Show only unresolved (red)"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          tab === "red" ? "ring-2 ring-red-500" : ""
        }`}
      >
        <span className="h-3.5 w-3.5 rounded-full bg-red-500" />
      </button>
      <button
        type="button"
        onClick={() => setTab("yellow")}
        aria-label="Show only needs attention (yellow)"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          tab === "yellow" ? "ring-2 ring-yellow-500" : ""
        }`}
      >
        <span className="h-3.5 w-3.5 rounded-full bg-yellow-400" />
      </button>
    </>
  )

  if (groupBy === "location") {
    const locationsWithCards = LOCATIONS.filter(
      (location) => byLocation(statusFiltered, location).length > 0
    )
    const locationGroups = LOCATIONS.map((location) => ({
      location,
      rows: byLocation(typedCards, location),
    })).filter((g) => g.rows.length > 0)
    const orderedLocationGroups = unfiltered
      ? [...locationGroups].sort((a, b) => worstUrgency(a.rows) - worstUrgency(b.rows))
      : locationGroups

    return (
      <>
        {groupByToggle}
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={handleViewAllClick}
            className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
              tab === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {tab === "all" ? (allOpen ? "Close All" : "Open All") : "View All"}
          </button>
          {statusDots}
        </div>

        <div className="slide-down mt-1 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-100/70 p-1.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveLocation(null)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-center transition-colors duration-100 active:scale-95 ${
              activeLocation === null
                ? "bg-brand/10 text-brand shadow-sm ring-1 ring-brand/30"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All
          </button>
          {locationsWithCards.map((location) => (
            <button
              type="button"
              key={location}
              onClick={() => {
                setActiveLocation(location)
                openGroups([location])
              }}
              className={`shrink-0 rounded-md px-2.5 py-1 text-center whitespace-nowrap transition-colors duration-100 active:scale-95 ${
                activeLocation === location
                  ? "bg-brand/10 text-brand shadow-sm ring-1 ring-brand/30"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {location}
            </button>
          ))}
        </div>

        {typedCards.length === 0 && (
          <p className="mt-3 text-gray-500">No matching equipment.</p>
        )}

        {orderedLocationGroups.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
            {orderedLocationGroups.map((g) => (
              <TypeGroup
                key={g.location}
                title={g.location}
                rows={g.rows}
                isOpen={isGroupOpen(g.location)}
                onToggle={(open) => toggleGroup(g.location, open)}
              />
            ))}
          </div>
        )}
      </>
    )
  }

  const orderedForkliftTypes = unfiltered
    ? [...FORKLIFT_TYPES].sort(
        (a, b) => worstUrgency(byType(typedCards, a)) - worstUrgency(byType(typedCards, b))
      )
    : FORKLIFT_TYPES
  const palletCards = byType(typedCards, "Pallet Jack")

  const forkliftBlock = FORKLIFT_TYPES.some((type) => byType(typedCards, type).length > 0) && (
    <div key="forklift">
      <h2 className="mt-4 text-sm font-bold tracking-wide text-brand uppercase">Forklift</h2>
      <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
        {orderedForkliftTypes.map((type) => (
          <TypeGroup
            key={type}
            title={equipmentTypeLabel(type)}
            rows={byType(typedCards, type)}
            isOpen={isGroupOpen(type)}
            onToggle={(open) => toggleGroup(type, open)}
          />
        ))}
      </div>
    </div>
  )

  const palletBlock = palletCards.length > 0 && (
    <div key="pallet">
      <h2 className="mt-4 text-sm font-bold tracking-wide text-brand uppercase">Pallet Jacks</h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
        <TypeGroup
          title="Pallet Jacks"
          rows={palletCards}
          isOpen={isGroupOpen("Pallet Jack")}
          onToggle={(open) => toggleGroup("Pallet Jack", open)}
        />
      </div>
    </div>
  )

  const forkliftFirst =
    !unfiltered ||
    worstUrgency(FORKLIFT_TYPES.flatMap((type) => byType(typedCards, type))) <=
      worstUrgency(palletCards)

  return (
    <>
      {groupByToggle}
      <div
        className={`flex items-center gap-1.5 rounded-t-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium ${
          tab === "forklift" ? "" : "rounded-b-lg"
        }`}
      >
        <button
          type="button"
          onClick={handleViewAllClick}
          className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
            tab === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          {tab === "all" ? (allOpen ? "Close All" : "Open All") : "View All"}
        </button>
        <button
          type="button"
          onClick={() => setTab("forklift")}
          className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
            tab === "forklift" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Forklift
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("Pallet Jack")
            openGroups(["Pallet Jack"])
          }}
          className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
            tab === "Pallet Jack" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Pallet Jacks
        </button>
        {statusDots}
      </div>

      {tab === "forklift" && (
        <div className="slide-down flex gap-1 rounded-b-lg border border-t-0 border-gray-200 bg-gray-100/70 p-1.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveSubtypes([])}
            className={`flex-1 rounded-md py-1 text-center transition-colors duration-100 active:scale-95 ${
              activeSubtypes.length === 0
                ? "bg-brand/10 text-brand shadow-sm ring-1 ring-brand/30"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All
          </button>
          {FORKLIFT_TYPES.map((type) => {
            const selected = activeSubtypes.includes(type)
            return (
              <button
                type="button"
                key={type}
                onClick={() => {
                  const next = toggleSubtype(activeSubtypes, type)
                  setActiveSubtypes(next)
                  if (next.includes(type)) openGroups([type])
                }}
                className={`flex-1 rounded-md py-1 text-center transition-colors duration-100 active:scale-95 ${
                  selected
                    ? "bg-brand/10 text-brand shadow-sm ring-1 ring-brand/30"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {equipmentTypeLabel(type)}
              </button>
            )
          })}
        </div>
      )}

      {typedCards.length === 0 && (
        <p className="mt-3 text-gray-500">No matching equipment.</p>
      )}

      {forkliftFirst ? (
        <>
          {forkliftBlock}
          {palletBlock}
        </>
      ) : (
        <>
          {palletBlock}
          {forkliftBlock}
        </>
      )}
    </>
  )
}
