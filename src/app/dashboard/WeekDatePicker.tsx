"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"

// Same hidden-date-input-over-a-📅-button pattern as ShiftDateNav, just
// jumping to the week containing whatever date gets picked instead of
// jumping to that exact day.
export default function WeekDatePicker({
  weekMondayKey,
  todayKey,
  hrefBase,
}: {
  weekMondayKey: string
  todayKey: string
  hrefBase: string
}) {
  const router = useRouter()
  const dateInputRef = useRef<HTMLInputElement>(null)

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.value
    if (!picked) return
    router.push(`${hrefBase}weekDate=${picked}`)
  }

  return (
    <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      <button
        type="button"
        onClick={() => dateInputRef.current?.showPicker?.()}
        aria-label="Pick a week"
        className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
      >
        📅
      </button>
      <input
        key={weekMondayKey}
        ref={dateInputRef}
        type="date"
        defaultValue={weekMondayKey}
        max={todayKey}
        onChange={handlePick}
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
  )
}
