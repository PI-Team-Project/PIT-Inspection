"use client"

import { useRouter } from "next/navigation"
import { useRef, type ReactNode, type TouchEvent } from "react"

// A deliberate flick, not an accidental brush while scrolling the tile grid
// below — both the minimum distance and the horizontal-over-vertical ratio
// exist so a normal vertical scroll through the page never misfires this.
const SWIPE_THRESHOLD_PX = 50

// Only two shifts exist, so swiping either direction always lands on "the
// other one" — there's no separate forward/back case to handle, unlike the
// date arrows next to it which step through many days.
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
  const touchStart = useRef<{ x: number; y: number } | null>(null)

  function handleTouchStart(e: TouchEvent<HTMLDivElement>) {
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY }
  }

  function handleTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    touchStart.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return

    const otherShift = selectedShiftLabel === "Day" ? "Night" : "Day"
    const href = dateParam
      ? `/dashboard?shift=${otherShift.toLowerCase()}&date=${dateParam}`
      : `/dashboard?shift=${otherShift.toLowerCase()}`
    router.push(href, { scroll: false })
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {children}
    </div>
  )
}
