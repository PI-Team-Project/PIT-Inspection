"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { clearInspectionDraft } from "@/lib/inspectionDraft"

export default function InspectionSuccessPage() {
  const router = useRouter()

  // Only reached after a real successful submission (the server action
  // redirects here) — safe to drop the autosaved draft now, not any
  // earlier, so a failed/interrupted submit still leaves it recoverable.
  useEffect(() => {
    clearInspectionDraft()
  }, [])

  useEffect(() => {
    // A little longer than before (was 2500ms) — the stamp's own
    // press-down animation takes ~550ms, and it deserves a moment to
    // actually be seen before the page moves on.
    const timer = setTimeout(() => router.push("/"), 3000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-24 text-center">
      {/* A rubber-stamp look, not a vehicle icon — this same page follows
          both a Forklift and a Pallet Jack submission, so nothing more
          specific than "completed" fits both. Red (not the app's own taupe
          brand color) is deliberate: a stamp reads as ink applied to the
          page, not as UI chrome, so it's allowed to look like a different,
          separate mark. */}
      <div
        aria-hidden="true"
        className="stamp-press pointer-events-none inline-block rounded-lg border-[6px] border-double border-red-600/85 px-5 py-2.5 select-none"
      >
        <p className="text-center text-xl leading-tight font-black tracking-widest text-red-600/85 uppercase sm:text-2xl">
          Inspection
          <br />
          Completed
        </p>
      </div>
      <h1 className="mt-6 text-2xl font-bold text-gray-900">
        Thank you for your submission!
      </h1>
      <p className="mt-2 text-gray-600">Have a safe shift.</p>
      <Link
        href="/"
        className="mt-6 text-sm text-gray-500 underline transition-transform duration-100 active:scale-95 active:text-gray-700"
      >
        Return now
      </Link>
    </main>
  )
}
