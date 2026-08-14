"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { shiftDateKeyByDays } from "@/lib/shifts"
import { shiftHasData } from "./actions"

export default function ShiftDateNav({
  dateKey,
  todayKey,
  label,
  dateLabel,
  hoursLabel,
  isViewingLive,
}: {
  dateKey: string
  todayKey: string
  label: "Day" | "Night"
  dateLabel: string
  hoursLabel: string
  isViewingLive: boolean
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
    router.push(`/dashboard?shift=${label.toLowerCase()}&date=${targetDateKey}`)
    return true
  }

  function handleBack() {
    void goToDate(shiftDateKeyByDays(dateKey, -1))
  }

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.value
    if (!picked || picked === dateKey) return
    const ok = await goToDate(picked)
    if (!ok) e.target.value = dateKey
  }

  return (
    <h2 className="mt-4 mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
      <button
        type="button"
        onClick={handleBack}
        disabled={checking}
        aria-label="Go back one day"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-95"
      >
        ‹
      </button>
      <span className="normal-case">
        {dateLabel} · {hoursLabel}
        {!isViewingLive && <span className="ml-1 text-gray-400">(Past)</span>}
      </span>
      <span className="relative ml-auto flex h-5 w-5 shrink-0 items-center justify-center">
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker?.()}
          disabled={checking}
          aria-label="Pick a date"
          className="flex h-5 w-5 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-95"
        >
          📅
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
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
    </h2>
  )
}
