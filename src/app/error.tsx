"use client"

// Catches an unhandled error anywhere in the page tree (e.g. a transient
// database hiccup during a server render) and shows a recoverable screen
// instead of a broken page. `reset()` re-renders the segment, so a one-off
// failure clears on a tap rather than needing a full reload — which is what
// keeps a 24/7 screen usable through a brief blip.
import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-lg font-bold text-gray-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-gray-600">
        This page hit a temporary error. Try again — it usually clears on a retry.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
        >
          Try again
        </button>
        {/* A full document load, not a client <Link>: after a render error
            the router can be in a bad state, and a hard navigation is the
            reliable way out. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-transform duration-100 active:scale-95 active:bg-gray-50"
        >
          Home
        </a>
      </div>
      {error.digest && <p className="mt-4 text-xs text-gray-400">Ref: {error.digest}</p>}
    </main>
  )
}
