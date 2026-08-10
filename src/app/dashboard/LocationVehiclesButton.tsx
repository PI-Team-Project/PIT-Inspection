"use client"

import { useState } from "react"
import StatusDot from "./StatusDot"
import type { Stage } from "@/lib/review"

type Vehicle = {
  serial: string
  flNumber: string
  makeColor: string
  stage: Stage | "none"
}

export default function LocationVehiclesButton({
  location,
  count,
  vehicles,
}: {
  location: string
  count: number
  vehicles: Vehicle[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-xs font-semibold tracking-wide text-brand uppercase underline-offset-2 hover:underline"
      >
        {location} ({count})
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {location} ({count})
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-gray-400 active:scale-95 active:bg-gray-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-5 w-5"
                >
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <ul className="space-y-1">
              {vehicles.map((v) => (
                <li key={v.serial}>
                  <a
                    href={`/dashboard/equipment/${v.serial}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm text-gray-800 active:bg-gray-100"
                  >
                    <StatusDot stage={v.stage} />
                    <span>
                      {v.makeColor} · {v.flNumber}
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
