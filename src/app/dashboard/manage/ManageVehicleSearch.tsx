"use client"

import { useMemo, useState } from "react"
import { equipmentCategory, equipmentTypeLabel, type EquipmentType } from "@/lib/equipment"

type SearchableVehicle = {
  serial: string
  flNumber: string
  makeColor: string
  type: EquipmentType
  location: string
  retired: boolean
}

type TypeFilter = "all" | "Forklift" | "Pallet Jack"

export default function ManageVehicleSearch({ vehicles }: { vehicles: SearchableVehicle[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vehicles.filter((v) => {
      if (typeFilter !== "all" && equipmentCategory(v.type) !== typeFilter) return false
      if (
        q &&
        !v.serial.toLowerCase().includes(q) &&
        !v.flNumber.toLowerCase().includes(q) &&
        !v.makeColor.toLowerCase().includes(q) &&
        !v.location.toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
  }, [vehicles, query, typeFilter])

  function reset() {
    setQuery("")
    setTypeFilter("all")
  }

  function close() {
    setOpen(false)
    reset()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search vehicles"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 active:scale-95 active:bg-gray-100"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={close}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="text-base font-bold text-gray-900">Find a vehicle</h3>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 active:scale-95 active:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 px-4 pb-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="FL#, serial, color, or location"
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />

              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-2">
                  {(["all", "Forklift", "Pallet Jack"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setTypeFilter(opt)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors duration-100 active:scale-95 ${
                        typeFilter === opt
                          ? "border-brand bg-brand/5 text-brand"
                          : "border-gray-300 text-gray-600"
                      }`}
                    >
                      {opt === "all" ? "All types" : opt === "Pallet Jack" ? "Pallet Jacks" : opt}
                    </button>
                  ))}
                </div>
                {(query || typeFilter !== "all") && (
                  <button
                    type="button"
                    onClick={reset}
                    className="shrink-0 text-xs font-medium text-gray-500 underline-offset-2 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <ul className="flex-1 space-y-1 overflow-y-auto border-t border-gray-100 p-2">
              {results.length === 0 && (
                <li className="px-2 py-6 text-center text-sm text-gray-500">
                  No vehicles match.
                </li>
              )}
              {results.map((v) => (
                <li key={v.serial}>
                  <a
                    href={`/dashboard/equipment/${v.serial}`}
                    onClick={close}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm text-gray-800 active:bg-gray-100"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        v.retired ? "bg-gray-300" : "bg-green-400"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      {v.makeColor} · {equipmentTypeLabel(v.type)} · {v.flNumber}
                      <span className="block text-xs text-gray-500">
                        {v.location}
                        {v.retired ? " · Retired" : ""}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
