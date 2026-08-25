"use client"

import { useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { shiftDateKeyByDays } from "@/lib/shifts"
import { shiftHasData } from "./actions"

export default function ShiftDateNav({
  dateKey,
  todayKey,
  label,
  dateLabel,
  isViewingLive,
  statusChip,
}: {
  dateKey: string
  todayKey: string
  label: "Day" | "Night"
  dateLabel: string
  isViewingLive: boolean
  statusChip: ReactNode
}) {
  const router = useRouter()
  const dateInputRef = useRef<HTMLInputElement>(null)
  const [checking, setChecking] = useState(false)

  async function goToDate(targetDateKey: string) {
    if (checking) return
    setChecking(true)
    const ok = await shiftHasData(targetDateKey, label)
    setChecking(false)
    if (!ok) {
      window.alert("No inspection data for that shift yet.")
      return false
    }
    router.push(`/dashboard?shift=${label.toLowerCase()}&date=${targetDateKey}`, { scroll: false })
    return true
  }

  function handleBack() {
    void goToDate(shiftDateKeyByDays(dateKey, -1))
  }

  function handleForward() {
    void goToDate(shiftDateKeyByDays(dateKey, 1))
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.value
    if (!picked || picked === dateKey) return
    const ok = await goToDate(picked)
    if (!ok) e.target.value = dateKey
  }

  return (
    <div className="mb-2">
      {/* Same size/spacing/arrow convention as WeeklyReport's header — one
          shared visual language for both date-nav rows on this page. The
          outer 3-column grid keeps the title truly centered regardless of
          the status chip's width, instead of the chip's width dragging it
          off-center. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div />
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={checking}
            aria-label="Go back one day"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
          >
            ‹
          </button>
          {/* Both the icon and the date text open the same calendar picker —
              two separate, explicit triggers (not an invisible input
              overlaying either) so each one's own click reliably fires,
              rather than one silently eating the other's clicks. */}
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker?.()}
            disabled={checking}
            aria-label="Pick a date"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
          >
            📅
          </button>
          <button
            type="button"
            onClick={() => dateInputRef.current?.showPicker?.()}
            disabled={checking}
            aria-label="Pick a date"
            className="rounded px-1.5 py-1 -mx-1.5 -my-1 text-sm font-semibold whitespace-nowrap text-gray-700 transition-colors duration-100 hover:bg-gray-100 active:scale-95"
          >
            {/* Always shows one of these two words instead of the label
                popping in and out — that was shifting how wide this whole
                row measured out depending on which date was selected. */}
            Report · {dateLabel}{" "}
            <span className="text-gray-400">({isViewingLive ? "Today" : "Past"})</span>
          </button>
          <input
            key={dateKey}
            ref={dateInputRef}
            type="date"
            defaultValue={dateKey}
            max={todayKey}
            onChange={handlePick}
            aria-hidden="true"
            tabIndex={-1}
            className="sr-only"
          />
          {isViewingLive ? (
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center text-gray-200"
            >
              ›
            </span>
          ) : (
            <button
              type="button"
              onClick={handleForward}
              disabled={checking}
              aria-label="Go forward one day"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
            >
              ›
            </button>
          )}
        </div>
        <div className="flex justify-end">{statusChip}</div>
      </div>
    </div>
  )
}
