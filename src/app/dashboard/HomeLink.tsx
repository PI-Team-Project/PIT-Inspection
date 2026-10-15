import Link from "next/link"

// Leads to the inspection start page ("/"), so it shows a clipboard rather
// than a house — the house means the dashboard everywhere else.

export default function HomeLink() {
  return (
    <Link
      href="/"
      aria-label="Start inspection"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brand transition-transform duration-100 hover:bg-brand/5 active:scale-95 active:bg-brand/10"
    >
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
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V3h6v1" />
        <path d="m9 13 2 2 4-4" />
      </svg>
    </Link>
  )
}
