"use client"

import { useState } from "react"
import {
  equipmentTypeLabel,
  EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT,
  type Equipment,
} from "@/lib/equipment"
import type { EquipmentRecord } from "@/lib/equipmentLocations"
import { retireVehicles } from "./actions"
import AddVehicleForm from "./AddVehicleForm"
import EditVehicleControl from "./EditVehicleControl"
import { ACTIVE_COLS, HIDE_ON_MOBILE, SortableHeader, type SortField } from "./tableShared"

export default function ActiveVehiclesTable({
  active,
  savedManagerName,
  sort,
  dir,
}: {
  active: EquipmentRecord[]
  savedManagerName: string
  sort: SortField
  dir: "asc" | "desc"
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingRetire, setConfirmingRetire] = useState(false)
  const [duplicateSeed, setDuplicateSeed] = useState<Equipment[] | null>(null)

  // Once a vehicle is retired it drops out of `active` on the next render,
  // so filter the raw selection against the current list on every render
  // instead of syncing it via an effect — retired serials just fall out.
  const validSelected = new Set([...selected].filter((s) => active.some((eq) => eq.serial === s)))
  const allSelected = active.length > 0 && validSelected.size === active.length
  const selectedEquipment = active.filter((eq) => validSelected.has(eq.serial))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(active.map((eq) => eq.serial)))
  }
  function toggleOne(serial: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(serial)) next.delete(serial)
      else next.add(serial)
      return next
    })
  }

  return (
    <div>
      <div className="mb-3 flex min-h-[2.25rem] flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-gray-700">{selectedEquipment.length} selected</span>
          <button
            type="button"
            disabled={selectedEquipment.length === 0}
            onClick={() => setDuplicateSeed(selectedEquipment)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          >
            Duplicate
          </button>
          <button
            type="button"
            disabled={selectedEquipment.length === 0}
            onClick={() => setConfirmingRetire(true)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100"
          >
            Retire Selected
          </button>
          <button
            type="button"
            disabled={selectedEquipment.length === 0}
            onClick={() => setSelected(new Set())}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        <AddVehicleForm savedManagerName={savedManagerName} duplicateSeed={duplicateSeed} />
      </div>

      <div className="rounded-lg border border-gray-200">
        <div
          className={`grid ${ACTIVE_COLS} gap-1.5 border-b border-gray-300 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs`}
        >
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all vehicles"
            className="h-3.5 w-3.5"
          />
          <SortableHeader field="flNumber" label="FL#" sort={sort} dir={dir} />
          <SortableHeader field="type" label="Type" sort={sort} dir={dir} />
          <SortableHeader field="makeColor" label="Make / Color" sort={sort} dir={dir} />
          <SortableHeader
            field="contractType"
            label="Contract"
            sort={sort}
            dir={dir}
            className="hidden sm:flex"
          />
          <SortableHeader
            field="location"
            label="Location"
            sort={sort}
            dir={dir}
            className="hidden sm:flex"
          />
          <SortableHeader
            field="serial"
            label="Serial#"
            sort={sort}
            dir={dir}
            className="hidden sm:flex"
          />
          <span></span>
        </div>
        {active.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-400">No active vehicles.</p>
        ) : (
          active.map((eq) => (
            <div
              key={eq.serial}
              className={`grid ${ACTIVE_COLS} items-center gap-1.5 border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0 hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
                validSelected.has(eq.serial) ? "bg-brand/10" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={validSelected.has(eq.serial)}
                onChange={() => toggleOne(eq.serial)}
                aria-label={`Select ${eq.flNumber}`}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">
                <span className="font-medium text-gray-900">{eq.flNumber}</span>
                {eq.createdAt > EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT && (
                  <span className="block text-[10px] leading-tight text-gray-400">
                    Added {eq.createdAt.toISOString().slice(0, 10)}
                  </span>
                )}
              </span>
              <span className="truncate text-gray-600">{equipmentTypeLabel(eq.type)}</span>
              <span className="truncate text-gray-700">{eq.makeColor}</span>
              <span className={`truncate text-gray-600 ${HIDE_ON_MOBILE}`}>{eq.contractType}</span>
              <span className={`truncate text-gray-600 ${HIDE_ON_MOBILE}`}>{eq.location}</span>
              <span className={`truncate text-gray-400 ${HIDE_ON_MOBILE}`}>{eq.serial}</span>
              <EditVehicleControl equipment={eq} savedManagerName={savedManagerName} />
            </div>
          ))
        )}
      </div>

      {confirmingRetire && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setConfirmingRetire(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Retire Vehicles</h3>
              <button
                type="button"
                onClick={() => setConfirmingRetire(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 active:scale-95 active:bg-gray-100"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-700">
              You selected <strong>{selectedEquipment.length}</strong> vehicle
              {selectedEquipment.length === 1 ? "" : "s"} to be retired. These vehicles will
              move to Retired Vehicles — their history stays on file for 2 years and they can
              be restored anytime before then.
            </p>

            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2">
              {selectedEquipment.map((eq) => (
                <li key={eq.serial} className="flex items-center justify-between gap-2 text-sm text-gray-700">
                  <span className="truncate">
                    {eq.flNumber} — {eq.makeColor}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {equipmentTypeLabel(eq.type)}
                  </span>
                </li>
              ))}
            </ul>

            <form
              action={async (formData) => {
                await retireVehicles(formData)
                setSelected(new Set())
                setConfirmingRetire(false)
              }}
              className="mt-4 flex gap-2"
            >
              {selectedEquipment.map((eq) => (
                <input key={eq.serial} type="hidden" name="serial" value={eq.serial} />
              ))}
              <button
                type="button"
                onClick={() => setConfirmingRetire(false)}
                className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-gray-700 py-2 text-sm font-semibold text-white active:scale-95"
              >
                Confirm
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
