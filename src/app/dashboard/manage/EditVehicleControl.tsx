"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { LOCATIONS, REPAIR_LOCATION, type Equipment } from "@/lib/equipment"
import { updateVehicle, retireVehicle } from "./actions"

const EQUIPMENT_TYPES = ["Sit Down", "Propane", "Standup", "Pallet Jack"] as const
const CONTRACT_TYPES = ["Rent", "Leasing", "Own"] as const

export default function EditVehicleControl({
  equipment,
  savedManagerName,
}: {
  equipment: Equipment
  savedManagerName: string
}) {
  const [open, setOpen] = useState(false)
  const [confirmingRetire, setConfirmingRetire] = useState(false)
  const [state, formAction, pending] = useActionState(updateVehicle, { error: null })
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setOpen(false)
    wasPending.current = pending
  }, [pending, state.error])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${equipment.flNumber}`}
        className="rounded-md p-1 text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
      >
        ✎
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={() => setOpen(false)}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Edit Vehicle</h3>
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
          <input type="hidden" name="serial" value={equipment.serial} />
          <p className="text-xs text-gray-400">Serial#: {equipment.serial}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Type</label>
              <select
                name="type"
                defaultValue={equipment.type}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">
                Contract Type
              </label>
              <select
                name="contractType"
                defaultValue={equipment.contractType}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {CONTRACT_TYPES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">FL#</label>
            <input
              type="text"
              name="flNumber"
              defaultValue={equipment.flNumber}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Make / Color</label>
            <input
              type="text"
              name="makeColor"
              defaultValue={equipment.makeColor}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500">Location</label>
            <select
              name="location"
              defaultValue={equipment.location}
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

          {state.error && <p className="text-xs font-semibold text-red-700">{state.error}</p>}

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
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>

        <div className="mt-4 border-t border-gray-200 pt-3">
          {!confirmingRetire ? (
            <button
              type="button"
              onClick={() => setConfirmingRetire(true)}
              className="text-xs font-medium text-gray-500 hover:underline"
            >
              Retire this vehicle
            </button>
          ) : (
            <form action={retireVehicle} className="space-y-2">
              <input type="hidden" name="serial" value={equipment.serial} />
              <p className="text-xs text-gray-600">
                This moves {equipment.flNumber} to Retired Vehicles. Its history stays on file
                for 2 years, and it can be restored anytime before then.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingRetire(false)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-gray-700 py-2 text-xs font-semibold text-white transition-transform duration-100 active:scale-95"
                >
                  Confirm Retire
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
