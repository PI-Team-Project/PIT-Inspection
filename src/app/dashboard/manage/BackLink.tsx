"use client"

import { useRouter } from "next/navigation"

// Real browser-history back — returns to whichever page actually linked
// here (a specific vehicle, the dashboard, wherever), instead of a fixed
// "/dashboard" destination that ignores where the visitor came from. Falls
// through to the plain href when there's no history to go back to (a fresh
// tab, a direct link) rather than doing nothing.
export default function BackLink() {
  const router = useRouter()

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (window.history.length > 1) {
      e.preventDefault()
      router.back()
    }
  }

  return (
    <a
      href="/dashboard"
      onClick={handleClick}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4"
      >
        <path
          fillRule="evenodd"
          d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 111.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z"
          clipRule="evenodd"
        />
      </svg>
      Back
    </a>
  )
}
