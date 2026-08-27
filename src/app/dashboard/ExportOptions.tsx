"use client"

import { useState } from "react"

type DateRange = "all" | "week" | "month" | "custom"
type Scope = "all" | "open" | "resolved"
type Format = "csv" | "excel"

const RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "custom", label: "Custom Range" },
]

// Fleet-wide: which VEHICLES to include (a vehicle qualifies if ANY of its
// history has an open/resolved issue — see fetchInspectionsForExport).
const SCOPE_OPTIONS_FLEET: { value: Scope; label: string; hint: string }[] = [
  { value: "all", label: "All Vehicles", hint: "Every vehicle in the fleet" },
  { value: "open", label: "Open Issues Only", hint: "Still unresolved or needs attention right now" },
  { value: "resolved", label: "Resolved Issues Only", hint: "Had an issue that's since been fixed and confirmed" },
]

// Single-vehicle: same idea, but per INSPECTION — there's only one vehicle
// here, so "which vehicles" isn't meaningful the same way; this filters
// which of its own past inspections to include instead.
const SCOPE_OPTIONS_VEHICLE: { value: Scope; label: string; hint: string }[] = [
  { value: "all", label: "All Inspections", hint: "Every inspection on file for this vehicle" },
  { value: "open", label: "Open Issues Only", hint: "Inspections still unresolved or needing attention" },
  { value: "resolved", label: "Resolved Issues Only", hint: "Inspections that had an issue since fixed and confirmed" },
]

const FORMAT_OPTIONS: { value: Format; label: string; hint: string }[] = [
  { value: "csv", label: "Summary (CSV)", hint: "One row per inspection, every vehicle in one sheet" },
  { value: "excel", label: "Detail (Excel)", hint: "One tab per vehicle, its full history top to bottom" },
]

const DEFAULT_TRIGGER_CLASS =
  "font-medium text-gray-400 transition-colors duration-100 hover:text-brand hover:underline active:text-brand-dark active:underline"

// Both fleet-wide and single-vehicle exports get a scope choice now (open
// issues only / resolved only / everything) — just worded differently
// (see SCOPE_OPTIONS_FLEET vs. SCOPE_OPTIONS_VEHICLE above), since one
// filters which vehicles qualify and the other filters which of one
// vehicle's own inspections do. Only the fleet-wide export additionally
// gets a format choice (flat CSV vs. a per-vehicle Excel workbook, via
// excelPath) — a single vehicle has nothing to split across workbook tabs.
// `triggerClassName` lets each call site match its own surrounding buttons
// (a bordered brand button next to "Manage Vehicles" on the dashboard, a
// plain text link on the equipment detail page) instead of forcing one
// look everywhere.
export default function ExportOptions({
  exportPath,
  excelPath,
  vehicleLabel,
  triggerClassName = DEFAULT_TRIGGER_CLASS,
}: {
  exportPath: string
  excelPath?: string
  // The FL# to name in the trigger/heading on a single-vehicle export (this
  // page's equipment) — without it, "Export CSV" reads identically to the
  // fleet-wide export elsewhere, so there's nothing telling someone this
  // button only ever covers the one vehicle they're already looking at.
  // Also selects the vehicle-flavored scope wording over the fleet-wide one.
  vehicleLabel?: string
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [format, setFormat] = useState<Format>("csv")

  const isVehicleExport = Boolean(vehicleLabel)
  const showFormat = Boolean(excelPath)
  const triggerLabel = showFormat
    ? "Export"
    : vehicleLabel
      ? `Export ${vehicleLabel} Only`
      : "Export CSV"

  function buildHref() {
    const path = format === "excel" && excelPath ? excelPath : exportPath
    const params = new URLSearchParams()
    params.set("range", range)
    if (range === "custom") {
      if (customFrom) params.set("from", customFrom)
      if (customTo) params.set("to", customTo)
    }
    params.set("scope", scope)
    return `${path}?${params.toString()}`
  }

  const customIncomplete = range === "custom" && (!customFrom || !customTo)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={() => setOpen(false)}
    >
      <div
        // Without a height cap, a shorter desktop window (a laptop with
        // browser chrome eating vertical space, a non-maximized window) let
        // this grow taller than the viewport with no way to scroll to what
        // overflowed — including the Download button itself. max-h + its
        // own overflow-y-auto means IT scrolls internally instead of
        // silently extending past the screen.
        className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-base font-bold text-gray-900">{triggerLabel}</h3>
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

        {/* Only the option groups scroll — the Download button below stays
            pinned in view no matter how tall this list gets, so it's never
            the part that ends up needing a scroll to reach. */}
        <div className="space-y-4 overflow-y-auto">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-500">Date Range</p>
            <div className="grid grid-cols-2 gap-1.5">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRange(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors duration-100 active:scale-95 ${
                    range === opt.value
                      ? "border-brand bg-brand/10 font-semibold text-brand"
                      : "border-gray-300 text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {range === "custom" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">To</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-gray-500">
              {isVehicleExport ? "Which Inspections" : "Which Vehicles"}
            </p>
            <div className="space-y-1.5">
              {(isVehicleExport ? SCOPE_OPTIONS_VEHICLE : SCOPE_OPTIONS_FLEET).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={`flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors duration-100 active:scale-95 ${
                    scope === opt.value ? "border-brand bg-brand/10" : "border-gray-300"
                  }`}
                >
                  <span className={`text-sm ${scope === opt.value ? "font-semibold text-brand" : "text-gray-800"}`}>
                    {opt.label}
                  </span>
                  <span className="text-xs text-gray-500">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {showFormat && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-500">Format</p>
              <div className="space-y-1.5">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormat(opt.value)}
                    className={`flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors duration-100 active:scale-95 ${
                      format === opt.value ? "border-brand bg-brand/10" : "border-gray-300"
                    }`}
                  >
                    <span className={`text-sm ${format === opt.value ? "font-semibold text-brand" : "text-gray-800"}`}>
                      {opt.label}
                    </span>
                    <span className="text-xs text-gray-500">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <a
          href={customIncomplete ? undefined : buildHref()}
          aria-disabled={customIncomplete}
          onClick={(e) => {
            if (customIncomplete) {
              e.preventDefault()
              return
            }
            setOpen(false)
          }}
          className={`mt-4 block shrink-0 rounded-lg py-3 text-center text-sm font-semibold text-white transition-transform duration-100 active:scale-95 ${
            customIncomplete ? "cursor-not-allowed bg-gray-300" : "bg-brand active:bg-brand-dark"
          }`}
        >
          Download {format === "excel" && showFormat ? "Excel" : "CSV"}
        </a>
      </div>
    </div>
  )
}
