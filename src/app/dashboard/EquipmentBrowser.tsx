"use client"

import { useState, type ReactNode } from "react"
import { equipmentTypeLabel, type EquipmentType } from "@/lib/equipment"
import type { Stage } from "@/lib/review"

type Card = {
  serial: string
  type: EquipmentType
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

function TypeGroup({ title, rows }: { title: string; rows: Card[] }) {
  if (rows.length === 0) return null
  return (
    <details open className="group mt-4 rounded-lg border border-gray-200">
      <summary className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-brand transition-colors duration-100 active:bg-gray-50">
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

type TabValue = "all" | "forklift" | "Pallet Jack" | "red" | "yellow"

function toggleSubtype(active: EquipmentType[], type: EquipmentType): EquipmentType[] {
  const next = active.includes(type) ? active.filter((t) => t !== type) : [...active, type]
  return next.length === 0 ? FORKLIFT_TYPES : next
}

export default function EquipmentBrowser({ cards }: { cards: Card[] }) {
  const [tab, setTab] = useState<TabValue>("all")
  const [activeSubtypes, setActiveSubtypes] = useState<EquipmentType[]>(FORKLIFT_TYPES)

  if (cards.length === 0) {
    return <p className="mt-3 text-gray-500">No equipment on file.</p>
  }

  const statusFiltered =
    tab === "red"
      ? cards.filter((c) => c.stage === "unresolved")
      : tab === "yellow"
        ? cards.filter((c) => c.stage === "pending-confirm")
        : cards

  const typedCards =
    tab === "forklift"
      ? statusFiltered.filter((c) => activeSubtypes.includes(c.type))
      : tab === "Pallet Jack"
        ? statusFiltered.filter((c) => c.type === "Pallet Jack")
        : statusFiltered

  const unfiltered = tab === "all"
  const orderedForkliftTypes = unfiltered
    ? [...FORKLIFT_TYPES].sort(
        (a, b) => worstUrgency(byType(typedCards, a)) - worstUrgency(byType(typedCards, b))
      )
    : FORKLIFT_TYPES
  const palletCards = byType(typedCards, "Pallet Jack")

  const forkliftBlock = FORKLIFT_TYPES.some((type) => byType(typedCards, type).length > 0) && (
    <div key="forklift">
      <h2 className="mt-6 text-sm font-bold tracking-wide text-brand uppercase">Forklift</h2>
      {orderedForkliftTypes.map((type) => (
        <TypeGroup key={type} title={equipmentTypeLabel(type)} rows={byType(typedCards, type)} />
      ))}
    </div>
  )

  const palletBlock = palletCards.length > 0 && (
    <div key="pallet">
      <h2 className="mt-6 text-sm font-bold tracking-wide text-brand uppercase">Pallet Jacks</h2>
      <TypeGroup title="Pallet Jacks" rows={palletCards} />
    </div>
  )

  const forkliftFirst =
    !unfiltered ||
    worstUrgency(FORKLIFT_TYPES.flatMap((type) => byType(typedCards, type))) <=
      worstUrgency(palletCards)

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
            tab === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          View All
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
          onClick={() => setTab("Pallet Jack")}
          className={`flex-1 rounded-md py-1.5 text-center transition-colors duration-100 active:scale-95 ${
            tab === "Pallet Jack" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Pallet Jacks
        </button>
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
      </div>

      {tab === "forklift" && (
        <div className="slide-down mt-2 flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveSubtypes(FORKLIFT_TYPES)}
            className={`flex-1 rounded-md py-1 text-center transition-colors duration-100 active:scale-95 ${
              activeSubtypes.length === FORKLIFT_TYPES.length
                ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                : "text-gray-500"
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
                onClick={() => setActiveSubtypes(toggleSubtype(activeSubtypes, type))}
                className={`flex-1 rounded-md py-1 text-center transition-colors duration-100 active:scale-95 ${
                  selected
                    ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                    : "text-gray-500"
                }`}
              >
                {selected ? "✓ " : ""}
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
