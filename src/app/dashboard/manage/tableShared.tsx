import Link from "next/link"
import { equipmentTypeLabel, type Equipment } from "@/lib/equipment"

// The trailing action column is a fixed width, not `auto` — an `auto`
// track sizes to its row's own content, and the header row's action cell
// is empty while data rows have a real button, so the two would compute
// different track widths and throw every `fr` column out of alignment.
export const ACTIVE_COLS =
  "grid-cols-[1.25rem_1fr_0.7fr_1.2fr_2rem] sm:grid-cols-[1.25rem_1.1fr_0.8fr_1.3fr_0.7fr_1fr_1.3fr_2rem]"
export const RETIRED_COLS =
  "grid-cols-[1fr_0.7fr_0.9fr_4rem] sm:grid-cols-[1.1fr_0.8fr_1.3fr_0.9fr_0.9fr_0.9fr_4rem]"
// Contract/Location/Serial# (active) and Make-Color/Retired By/Retired On
// (retired) only show at sm+ — narrow phones get the essentials plus the
// action, everything else is one tap away in the edit popup.
export const HIDE_ON_MOBILE = "hidden sm:block"

// `added` sorts by the vehicle's registration date. createdAt is a real
// Date, so it's compared as an ISO string (lexical order = chronological)
// through the same localeCompare path every other field uses.
type SortInput = Equipment & { createdAt: Date }

export const SORT_FIELDS = {
  flNumber: (eq: SortInput) => eq.flNumber,
  type: (eq: SortInput) => equipmentTypeLabel(eq.type),
  makeColor: (eq: SortInput) => eq.makeColor,
  contractType: (eq: SortInput) => eq.contractType,
  location: (eq: SortInput) => eq.location,
  serial: (eq: SortInput) => eq.serial,
  added: (eq: SortInput) => eq.createdAt.toISOString(),
} as const
export type SortField = keyof typeof SORT_FIELDS

export function isSortField(value: string): value is SortField {
  return value in SORT_FIELDS
}

export function SortableHeader({
  field,
  label,
  sort,
  dir,
  className,
}: {
  field: SortField
  label: string
  sort: SortField
  dir: "asc" | "desc"
  className?: string
}) {
  const active = sort === field
  const nextDir = active && dir === "asc" ? "desc" : "asc"
  return (
    <Link
      href={`/dashboard/manage?sort=${field}&dir=${nextDir}`}
      scroll={false}
      className={`${className ?? "flex"} items-center gap-0.5 hover:text-gray-700 ${active ? "text-gray-700" : ""}`}
    >
      {label}
      {active && <span>{dir === "asc" ? "▲" : "▼"}</span>}
    </Link>
  )
}
