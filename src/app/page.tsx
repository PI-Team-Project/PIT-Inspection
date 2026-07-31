import Link from "next/link"

export default function Home() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
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
    </main>
  )
}
