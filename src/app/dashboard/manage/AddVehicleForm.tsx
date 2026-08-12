"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { LOCATIONS, REPAIR_LOCATION } from "@/lib/equipment"
import { addVehicles } from "./actions"

const EQUIPMENT_TYPES = ["Sit Down", "Propane", "Standup", "Pallet Jack"] as const
const CONTRACT_TYPES = ["Rent", "Leasing", "Own"] as const

let nextRowKey = 1

export default function AddVehicleForm({ savedManagerName }: { savedManagerName: string }) {
  const [open, setOpen] = useState(false)
  const [rowKeys, setRowKeys] = useState<number[]>([0])
  const [state, formAction, pending] = useActionState(addVehicles, { error: null })
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false)
      setRowKeys([0])
    }
    wasPending.current = pending
  }, [pending, state.error])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700"
      >
        + Add Vehicle
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={() => setOpen(false)}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">Add Vehicle</h3>
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
          <input type="hidden" name="rowCount" value={rowKeys.length} />

          {rowKeys.map((key, index) => (
            <div key={key} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-500">Vehicle {index + 1}</p>
                {rowKeys.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRowKeys((keys) => keys.filter((k) => k !== key))}
                    className="text-xs font-medium text-gray-400 hover:text-red-600"
                  >
                    ✕ Remove
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  name={`type_${index}`}
                  defaultValue={EQUIPMENT_TYPES[0]}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {EQUIPMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <select
                  name={`contractType_${index}`}
                  defaultValue={CONTRACT_TYPES[0]}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {CONTRACT_TYPES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  name={`flNumber_${index}`}
                  placeholder="FL#"
                  required
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  name={`serial_${index}`}
                  placeholder="Serial#"
                  required
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <input
                type="text"
                name={`makeColor_${index}`}
                placeholder="Make / Color (e.g. Mint Mitsubishi)"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                name={`location_${index}`}
                defaultValue={LOCATIONS[0]}
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
          ))}

          <button
            type="button"
            onClick={() => setRowKeys((keys) => [...keys, nextRowKey++])}
            className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-gray-500 active:scale-95"
          >
            + Add another vehicle
          </button>

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
              {pending ? "Saving…" : `Save ${rowKeys.length > 1 ? `${rowKeys.length} Vehicles` : "Vehicle"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
