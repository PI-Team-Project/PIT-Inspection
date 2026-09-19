import Link from "next/link"

// Friendly 404 — a mistyped vehicle URL or an old link lands here instead of
// a bare error.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-lg font-bold text-gray-900">Page not found</h1>
      <p className="mt-2 text-sm text-gray-600">
        That page doesn&apos;t exist. It may have been a mistyped or outdated link.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
      >
        Home
      </Link>
    </main>
  )
}
