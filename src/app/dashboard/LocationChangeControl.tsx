"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { LOCATIONS, REPAIR_LOCATION, isUnderRepair } from "@/lib/equipment"
import { updateEquipmentLocation } from "./actions"

export default function LocationChangeControl({
  serial,
  currentLocation,
  savedManagerName,
}: {
  serial: string
  currentLocation: string
  savedManagerName: string
}) {
  const [open, setOpen] = useState(false)
  const [, formAction, pending] = useActionState(updateEquipmentLocation, null)
  const wasPending = useRef(false)

  // The action doesn't report success/failure — closing on the
  // true→false edge of `pending` is enough since the only failure mode
  // (bad serial/location) can't happen from this dropdown-driven form.
  useEffect(() => {
    if (wasPending.current && !pending) setOpen(false)
    wasPending.current = pending
  }, [pending])

  const underRepair = isUnderRepair(currentLocation)

  if (!open) {
    // No pill, no pencil icon — plain text that just changes color on
    // hover/tap, the same "this is clickable" cue used elsewhere on this
    // page (the review links) rather than button chrome.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          underRepair
            ? "font-semibold text-amber-700 transition-colors duration-100 hover:text-amber-900 hover:underline active:text-amber-900 active:underline"
            : "text-gray-600 transition-colors duration-100 hover:text-brand hover:underline active:text-brand-dark active:underline"
        }
      >
        {underRepair ? "🛠️ Under Repair" : `📍 ${currentLocation}`}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Change Location</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 active:scale-95 active:bg-gray-100"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="serial" value={serial} />
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              New Location
            </label>
            <select
              name="location"
              defaultValue={currentLocation}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <optgroup label="Warehouse Locations">
                {LOCATIONS.filter((loc) => loc !== REPAIR_LOCATION).map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Status">
                <option value={REPAIR_LOCATION}>{REPAIR_LOCATION}</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              Supervisor Name
            </label>
            <input
              type="text"
              name="managerName"
              defaultValue={savedManagerName}
              placeholder="Name of the supervisor"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save New Location"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
