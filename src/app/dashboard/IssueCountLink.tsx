"use client"

import type { ReactNode } from "react"

export const SHOW_VEHICLES_EVENT = "show-vehicles"
export type ShowVehiclesDetail = "red" | "yellow"

// The headline's "N unresolved" / "N attention" counts. Tapping one jumps
// to All Vehicles with that status filter already on, since the shift grid
// above only colours vehicles checked this shift and an older open issue
// otherwise has nowhere visible to point at. EquipmentBrowser listens for
// the event, sets its filter and scrolls itself into view.
export default function IssueCountLink({
  status,
  className,
  children,
}: {
  status: ShowVehiclesDetail
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new CustomEvent<ShowVehiclesDetail>(SHOW_VEHICLES_EVENT, { detail: status }))
      }
      className={className}
    >
      {children}
    </button>
  )
}
