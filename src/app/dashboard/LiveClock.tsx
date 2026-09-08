"use client"

import { useEffect, useState } from "react"

// The dashboard page is a Server Component — its time label is computed
// once at render and would otherwise sit frozen until the next full page
// load. This ticks it client-side so it reads as an actual clock.
function formatTime(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date())
    .replace(" ", "")
}

export default function LiveClock({
  timeZone,
  initialLabel,
}: {
  timeZone: string
  initialLabel: string
}) {
  // Starts from the server-rendered label so hydration matches, then ticks.
  const [label, setLabel] = useState(initialLabel)

  useEffect(() => {
    const id = setInterval(() => setLabel(formatTime(timeZone)), 1000)
    return () => clearInterval(id)
  }, [timeZone])

  return (
    // text-base, three steps down the scale from the text-2xl this used to
    // be: at that size the clock read as the page's headline, competing with
    // the actual title above it, when it's really just context for the shift
    // being viewed.
    <span className="font-mono text-base font-semibold tracking-wide text-gray-900 tabular-nums">
      {label}
    </span>
  )
}
