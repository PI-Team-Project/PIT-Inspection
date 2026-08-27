import Link from "next/link"

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-4 pt-8 pb-4 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 flex select-none items-center justify-center overflow-hidden"
      >
        <span className="-rotate-[20deg] whitespace-nowrap text-4xl font-extrabold tracking-widest text-gray-900 opacity-[0.04]">
          WORK IN PROGRESS
        </span>
      </div>

      <p className="text-xs font-medium tracking-wide text-gray-400">
        📍 Holland, Michigan
      </p>
      <h1 className="mt-1 text-3xl font-bold text-gray-900">PIT Inspection</h1>
      <p className="mt-2 text-gray-600">
        Warehouse vehicle pre-shift inspection.
      </p>

      <p className="mt-4 text-sm text-gray-600">
        Inspection{" "}
        <span className="text-sweep-highlight rounded px-0.5 font-medium text-gray-700">
          must be completed at beginning of every shift
        </span>{" "}
        to ensure equipment is in good condition to use. Thanks for keeping
        us safe.
      </p>

      <div className="mt-6 flex w-full flex-col gap-3">
        <Link
          href="/inspection"
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
        >
          Start Inspection
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-brand/30 px-6 py-3 font-semibold text-brand transition-transform duration-100 active:scale-95 active:bg-brand/10"
        >
          Manager Dashboard
        </Link>
      </div>

      <div className="mt-6 flex flex-col items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qr-inspection.svg"
          alt="QR code linking to the inspection form"
          className="aspect-square w-full max-w-[128px] rounded-lg border border-gray-200 p-2"
        />
        <p className="text-xs text-gray-400">Scan to start an inspection</p>
      </div>
    </main>
  )
}
