import Link from "next/link"

export default function HomeLink() {
  return (
    <Link
      href="/"
      aria-label="Home"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand/30 text-brand transition-transform duration-100 hover:bg-brand/5 active:scale-95 active:bg-brand/10"
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
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
      </svg>
    </Link>
  )
}
