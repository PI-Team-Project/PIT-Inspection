"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Bookmark-style tab fixed to the right edge of every dashboard page. On the
// dashboard itself it scrolls back to the top; anywhere else it goes to the
// dashboard.
//
// The page scrolls inside #app-scroll-container (see layout.tsx), not the
// window, so that's the element to scroll.
const TAB_CLASS =
  "fixed top-1/3 right-0 z-40 flex h-11 w-10 items-center justify-center rounded-l-lg bg-brand text-white shadow-md transition-transform duration-100 hover:w-11 active:scale-95"

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

export default function DashboardHomeTab() {
  const pathname = usePathname()

  if (pathname === "/dashboard") {
    return (
      <button
        type="button"
        onClick={() => document.getElementById("app-scroll-container")?.scrollTo({ top: 0 })}
        aria-label="Back to top of dashboard"
        className={TAB_CLASS}
      >
        <HouseIcon />
      </button>
    )
  }

  return (
    <Link href="/dashboard" aria-label="Dashboard" className={TAB_CLASS}>
      <HouseIcon />
    </Link>
  )
}
