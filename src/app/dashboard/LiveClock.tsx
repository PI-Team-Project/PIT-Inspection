"use client"

import { useEffect, useState } from "react"
import { formatClock } from "@/lib/shifts"

// The dashboard page is a Server Component — its time label is computed
// once at render and would otherwise sit frozen until the next full page
// load. This ticks it client-side so it reads as an actual clock.
export default function LiveClock({
  timeZone,
  initialLabel,
}: {
  timeZone: string
  initialLabel: { time: string; zone: string }
}) {
  // Starts from the server-rendered label so hydration matches, then ticks.
  const [label, setLabel] = useState(initialLabel)

  useEffect(() => {
    const id = setInterval(() => setLabel(formatClock(timeZone, new Date())), 1000)
    return () => clearInterval(id)
  }, [timeZone])

  // Shown as a subtitle under the dashboard title, so it takes the line's
  // small grey text; only the time itself is darker and monospaced so the
  // digits don't jitter as they tick.
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <span className="font-mono font-semibold text-gray-600 tabular-nums">{label.time}</span>
      <span>{label.zone}</span>
    </span>
  )
}
