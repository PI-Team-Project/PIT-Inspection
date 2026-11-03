"use client"

import { useState } from "react"
import Link from "next/link"
import { FIRST_COL, TABLE, TABLE_WRAP, TD, TH, UsageCell } from "./tableParts"

export type UseLevelRow = {
  serial: string
  flNumber: string
  typeLabel: string
  contract: string
  location: string
  shiftsUsed: number
  shiftsInFleet: number
  rate: number
  lastUsed: string
}

type Level = "low" | "high"

// Low and high use share one table; the toggle swaps which list it shows.
export default function UseLevelTable({
  low,
  high,
  lowLabel,
  highLabel,
}: {
  low: UseLevelRow[]
  high: UseLevelRow[]
  lowLabel: string
  highLabel: string
}) {
  const [level, setLevel] = useState<Level>("low")
  const rows = level === "low" ? low : high
  const options: { key: Level; label: string; count: number }[] = [
    { key: "low", label: "Low Use", count: low.length },
    { key: "high", label: "High Use", count: high.length },
  ]

  return (
    <section className="mt-6">
      <div className="mb-2 flex h-7 items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setLevel(o.key)}
              aria-pressed={level === o.key}
              className={`rounded px-2.5 py-1 ${
                level === o.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {o.label} <span className="tabular-nums">{o.count}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">{level === "low" ? lowLabel : highLabel}</span>
      </div>

      {rows.length > 0 && (
        <div className={TABLE_WRAP}>
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={`${TH} ${FIRST_COL} text-left`}>Vehicle</th>
                <th className={`${TH} text-left`}>Contract</th>
                <th className={`${TH} hidden text-left sm:table-cell`}>Location</th>
                <th className={`${TH} text-center`}>Shifts Used</th>
                <th className={`${TH} text-center`}>Usage</th>
                <th className={`${TH} text-center`}>Last Used</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.serial}>
                  <td className={TD}>
                    <Link
                      href={`/dashboard/equipment/${v.serial}`}
                      className="block truncate font-medium text-gray-900 hover:underline"
                    >
                      {v.flNumber}
                    </Link>
                    <span className="block truncate text-[11px] text-gray-400">{v.typeLabel}</span>
                  </td>
                  <td className={`${TD} text-gray-700`}>{v.contract}</td>
                  <td className={`${TD} hidden leading-tight text-gray-700 sm:table-cell`}>{v.location}</td>
                  <td className={`${TD} text-center tabular-nums text-gray-700`}>
                    {v.shiftsUsed}/{v.shiftsInFleet}
                  </td>
                  <td className={TD}>
                    <UsageCell rate={v.rate} />
                  </td>
                  <td className={`${TD} text-center tabular-nums text-gray-700`}>{v.lastUsed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
