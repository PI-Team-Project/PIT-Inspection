"use client"

import { useRouter } from "next/navigation"
import { shiftDateKeyByDays } from "@/lib/shifts"

export default function ShiftDateNav({
  dateKey,
  todayKey,
  label,
  dateLabel,
  isViewingLive,
}: {
  dateKey: string
  todayKey: string
  label: "Day" | "Night"
  dateLabel: string
  isViewingLive: boolean
}) {
  const router = useRouter()

  // Navigation is unconditional now. It used to await shiftHasData() first
  // and refuse any shift with no inspections on record, which made an empty
  // day unreachable rather than merely empty — and since the arrow only ever
  // steps ONE day, a single empty day walled off everything behind it. After
  // the 2026-08-28 wipe that meant the back arrow did nothing at all from
  // today, and the only day carrying data couldn't be reached from the nav
  // by any number of clicks. An empty shift renders perfectly well (0/34,
  // every tile "Not yet"), so there was nothing to protect anyone from.
  //
  // Dropping the check also removes the await that gated these handlers: the
  // old `checking` flag was set before it and cleared after with no
  // try/finally, so one rejected server action left the flag stuck true and
  // permanently disabled both arrows AND the date input via `disabled`.
  // Future dates stay blocked by max={todayKey} below, the forward arrow
  // being hidden while isViewingLive, and the server's own window guard in
  // page.tsx — none of which need a round trip.
  function goToDate(targetDateKey: string) {
    router.push(`/dashboard?shift=${label.toLowerCase()}&date=${targetDateKey}`, { scroll: false })
  }

  function handleBack() {
    goToDate(shiftDateKeyByDays(dateKey, -1))
  }

  function handleForward() {
    goToDate(shiftDateKeyByDays(dateKey, 1))
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.value
    if (!picked || picked === dateKey) return
    goToDate(picked)
  }

  // The invisible native input below is what makes a tap work on iOS, and
  // it stays the mechanism. But desktop Chrome/Edge only open the picker
  // when the click lands on the input's own calendar indicator, which
  // opacity-0 hides — so a click anywhere else merely focused the field and
  // nothing appeared. showPicker() closes exactly that gap. It's an
  // enhancement, not the trigger: feature-detected, and any rejection is
  // swallowed so mobile still relies purely on the native tap that commit
  // 4d86989 restored when it stopped depending on showPicker() alone.
  function handlePickerClick(e: React.MouseEvent<HTMLInputElement>) {
    const input = e.currentTarget
    if (typeof input.showPicker !== "function") return
    try {
      input.showPicker()
    } catch {
      // Already-open pickers and non-user-activated calls throw in some
      // browsers; the native tap covers both cases.
    }
  }

  return (
    <div className="mb-2">
      {/* Same size/spacing/arrow convention as WeeklyReport's header — one
          shared visual language for both date-nav rows on this page, and
          now the same centering too. This row was previously left-aligned
          because it shared its width with the inspected-count chip:
          centering it let the nav's box grow wide enough on a narrow phone
          that its text visually overlapped the chip, and since the chip
          came later in the DOM it painted on top and silently ate taps
          meant for the calendar icon underneath. The chip now lives one
          line up on the clock row, so this row owns its full width and
          centering is safe. `min-w-0` + `truncate` still let the date text
          give way rather than overflow on a narrow screen. */}
      <div className="flex items-center justify-center gap-2">
        <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={handleBack}
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
              onClick={handlePickerClick}
              aria-label="Pick a date"
              className="absolute inset-0 z-10 cursor-pointer opacity-0"
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
              aria-label="Go forward one day"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-400 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-600 active:scale-90"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
