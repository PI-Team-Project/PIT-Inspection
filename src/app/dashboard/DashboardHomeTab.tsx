"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

// Bookmark-style tab fixed to the right edge of every dashboard page. On the
// dashboard itself it scrolls back to the top; anywhere else it goes to the
// dashboard.
//
// The page scrolls inside #app-scroll-container (see layout.tsx), not the
// window, so that's the element to scroll.
//
// `tucked`: on phones the tab sits half off-screen, leaving the inner 20px
// showing, so it doesn't cover the right edge of full-width content (Manage
// Vehicles' table, a vehicle page's values). The dashboard itself keeps the
// full tab. The first tap, or a pull to the left, slides it out;
// tapping it again uses it. It tucks back after a few seconds or a tap
// anywhere else.
const TAB_CLASS =
  "fixed top-1/3 right-0 z-40 flex h-11 w-10 items-center justify-center rounded-l-lg bg-brand text-white opacity-70 shadow-md transition-[width,opacity,transform] duration-150 hover:w-11 hover:opacity-100 active:scale-95"

// Matches Tailwind's `max-sm` — the widths where the tab is tucked.
const PHONE_QUERY = "(max-width: 639px)"
const AUTO_TUCK_MS = 3000

function HouseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

export default function DashboardHomeTab({ tucked = false }: { tucked?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => setOpen(false), AUTO_TUCK_MS)
    function onOutside(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onOutside)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("pointerdown", onOutside)
    }
  }, [open])

  const isTucked = tucked && !open
  const className = `${TAB_CLASS} ${isTucked ? "max-sm:translate-x-5" : ""}`

  // True when this tap should only slide the tab out, not act.
  function slideOutFirst(e: React.MouseEvent) {
    if (isTucked && window.matchMedia(PHONE_QUERY).matches) {
      e.preventDefault()
      setOpen(true)
      return true
    }
    return false
  }

  const touchHandlers = tucked
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          touchStartX.current = e.touches[0].clientX
        },
        onTouchMove: (e: React.TouchEvent) => {
          const start = touchStartX.current
          if (start !== null && start - e.touches[0].clientX > 8) setOpen(true)
        },
      }
    : {}

  if (pathname === "/dashboard") {
    return (
      <button
        ref={ref as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={(e) => {
          if (slideOutFirst(e)) return
          document.getElementById("app-scroll-container")?.scrollTo({ top: 0 })
        }}
        aria-label="Back to top of dashboard"
        className={className}
        {...touchHandlers}
      >
        <HouseIcon />
      </button>
    )
  }

  return (
    <Link
      ref={ref as React.RefObject<HTMLAnchorElement>}
      href="/dashboard"
      onClick={slideOutFirst}
      aria-label="Dashboard"
      className={className}
      {...touchHandlers}
    >
      <HouseIcon />
    </Link>
  )
}
