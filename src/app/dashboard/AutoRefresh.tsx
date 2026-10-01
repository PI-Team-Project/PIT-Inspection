"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const INTERVAL_MS = 60_000

// Keeps an open dashboard current without a reload: every minute it re-asks
// the server for fresh data (router.refresh keeps scroll position and client
// state). Skipped while the tab is hidden, and while someone is typing in a
// field, so a refresh never lands under a half-filled form; a tab coming
// back into view refreshes at once if it has missed a turn.
export default function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    let last = Date.now()
    const busy = () => {
      const el = document.activeElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    }
    const tick = () => {
      if (document.hidden || busy()) return
      last = Date.now()
      router.refresh()
    }
    const id = setInterval(tick, INTERVAL_MS)
    const onVisible = () => {
      if (!document.hidden && Date.now() - last >= INTERVAL_MS) tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router])

  return null
}
