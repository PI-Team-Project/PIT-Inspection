import Link from "next/link"

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900">PIT Inspection</h1>
      <p className="mt-2 text-gray-600">
        Warehouse vehicle pre-shift inspection.
      </p>
      <div className="mt-8 flex w-full flex-col gap-3">
        <Link
          href="/inspection"
          className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700"
        >
          Start Inspection
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-transform duration-100 active:scale-95 active:bg-gray-100"
        >
          Manager Dashboard
        </Link>
      </div>

      <div className="mt-8 flex aspect-square w-full max-w-[200px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-center text-sm text-gray-400">
        <span>
          QR Code
          <br />
          (coming soon)
        </span>
      </div>

      <div className="mt-8 w-full rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <p className="font-medium">Form version comparison</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <Link href="/inspection-v1" className="underline">
            v1 — full checklist
          </Link>
          <Link href="/inspection-v2" className="underline">
            v2 — compact chips
          </Link>
          <Link href="/inspection" className="underline">
            v3 — one question per screen (current)
          </Link>
        </p>
      </div>
    </main>
  )
}
