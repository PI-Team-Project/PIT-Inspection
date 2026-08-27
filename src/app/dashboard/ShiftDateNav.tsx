"use client"

import { useState, type ReactNode } from "react"
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
          shared visual language for both date-nav rows on this page.
          Left-aligned (not centered) so the nav never fights the status
          chip for the same space: centering it used to let the nav's own
          box grow wide enough on a narrow phone that its text visually
          overlapped the chip — and since the chip came later in the DOM,
          it painted on top and silently ate taps meant for the calendar
          icon/date text underneath it. `min-w-0` + `truncate` on the nav
          side lets the date text give way before it ever reaches the
          chip, instead of overflowing into it. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={checking}
            aria-label="Go back one day"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
          >
            ‹
          </button>
          {/* The real date input sits directly on top of the icon+label
              (an invisible, exact-size overlay), so a tap lands on the
              actual native control instead of a JS `showPicker()` call
              made from a separate button's onClick. showPicker() looked
              fine in every test but turned out unreliable on a real phone
              — the same class of "works in testing, not on iOS" gap this
              app already hit once with a custom swipe gesture. A direct
              tap on the real input is what a plain, unstyled date input
              would get anyway, so there's no browser-specific behavior
              left to depend on. */}
          <div className="relative flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm text-gray-400"
            >
              📅
            </span>
            <span className="min-w-0 truncate rounded px-1.5 py-1 -mx-1.5 -my-1 text-sm font-semibold text-gray-700">
              {/* Always shows one of these two words instead of the label
                  popping in and out — that was shifting how wide this whole
                  row measured out depending on which date was selected.
                  Hidden below sm: there wasn't room for it on a narrow phone
                  without squeezing the status chip on the right into
                  invisibility — a responsive hide is fine here since it's
                  tied to viewport width, not app state, so it can't cause
                  the same kind of jump. Truncates (rather than wrapping)
                  on a very narrow phone so it shrinks instead of pushing
                  into the status chip's space. */}
              Daily Report · {dateLabel}
              <span className="hidden text-gray-400 sm:inline"> ({isViewingLive ? "Today" : "Past"})</span>
            </span>
            <input
              key={dateKey}
              type="date"
              defaultValue={dateKey}
              max={todayKey}
              onChange={handlePick}
              disabled={checking}
              aria-label="Pick a date"
              className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-default"
            />
          </div>
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
        <div className="shrink-0">{statusChip}</div>
      </div>
    </div>
  )
}
