"use client"

import { Suspense, useEffect, useLayoutEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

// The app's real scroll container is #app-scroll-container (body itself is
// overflow-hidden — see layout.tsx), which Next's <Link scroll={false}> and
// router.push(href, { scroll: false }) never manage — those only ever touch
// window's scroll position. Worse, clicking a link that causes a re-render
// triggers the browser's own "scroll focused element into view" behavior
// (the clicked element gets unmounted/remounted with fresh data), which
// resets the container to scrollTop 0 *before* any navigation completes.
// A plain passive "scroll" listener captures that transient 0 as if it
// were the real position, corrupting the value we meant to restore. So
// this captures on pointerdown instead — the earliest possible moment,
// before Next's click handling or the browser's own scroll can run —
// and restores it synchronously right after each navigation commits.
let lastScrollTop = 0

function ScrollPreserverInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const container = document.getElementById("app-scroll-container")
    if (!container) return
    // pointerdown only, deliberately — a continuous "scroll" listener would
    // also fire during the brief post-click reset-to-0 window (before the
    // layout effect below gets to restore it) and overwrite this with 0
    // again, which is exactly the bug this exists to fix.
    const capture = () => {
      lastScrollTop = container.scrollTop
    }
    container.addEventListener("pointerdown", capture, { capture: true })
    return () => {
      container.removeEventListener("pointerdown", capture, { capture: true })
    }
  }, [])

  useLayoutEffect(() => {
    const container = document.getElementById("app-scroll-container")
    if (container) container.scrollTop = lastScrollTop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams.toString()])

  return null
}

export default function ScrollPreserver() {
  return (
    <Suspense fallback={null}>
      <ScrollPreserverInner />
    </Suspense>
  )
}
