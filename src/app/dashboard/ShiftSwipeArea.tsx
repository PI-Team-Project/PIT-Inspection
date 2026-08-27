"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, type ReactNode } from "react"

// Was a left/right swipe (via onTouchStart/onTouchEnd) — replaced after the
// inspection form's own swipe-back gesture turned out to collide with
// Mobile Safari's own system "swipe back in browser history" gesture on a
// real phone (confirmed root cause there: a horizontal drag can get
// silently claimed by iOS before, or simultaneously with, this page's own
// JS, and no fix to the JS side changes that — it's a conflict with the
// browser itself). This carried the exact same risk: a real swipe here
// could navigate a manager's whole browser tab away from the dashboard
// instead of just toggling the shift. A double-tap doesn't compete with
// any system gesture the way a drag does.
const DOUBLE_TAP_MS = 400
const DOUBLE_TAP_MOVE_PX = 60

export default function ShiftSwipeArea({
  selectedShiftLabel,
  dateParam,
  children,
}: {
  selectedShiftLabel: "Day" | "Night"
  dateParam: string | null
  children: ReactNode
}) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function onClick(e: MouseEvent) {
      // Only counts on empty space — a tap that actually hits a button/link
      // (the Day/Night toggle itself, an equipment tile, the calendar
      // icon...) just does that control's own job, same as any other
      // double-click on a real control would.
      const target = e.target as HTMLElement
      if (target.closest("button, a, label, input, textarea, select")) return

      const now = Date.now()
      const last = lastTapRef.current
      if (
        last &&
        now - last.time < DOUBLE_TAP_MS &&
        Math.abs(e.clientX - last.x) < DOUBLE_TAP_MOVE_PX &&
        Math.abs(e.clientY - last.y) < DOUBLE_TAP_MOVE_PX
      ) {
        lastTapRef.current = null
        const otherShift = selectedShiftLabel === "Day" ? "Night" : "Day"
        const href = dateParam
          ? `/dashboard?shift=${otherShift.toLowerCase()}&date=${dateParam}`
          : `/dashboard?shift=${otherShift.toLowerCase()}`
        router.push(href, { scroll: false })
        return
      }
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY }
    }

    el.addEventListener("click", onClick)
    return () => el.removeEventListener("click", onClick)
  }, [selectedShiftLabel, dateParam, router])

  return <div ref={containerRef}>{children}</div>
}
