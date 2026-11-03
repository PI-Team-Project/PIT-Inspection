import Link from "next/link"

// The dashboard's sections as tabs in the title line, so switching between
// them costs no extra row. Phone width uses the short names — both full
// names don't fit beside the header icons there.
const TABS = [
  { key: "inspection", href: "/dashboard", label: "Inspection Dashboard", short: "Dashboard" },
  { key: "usage", href: "/dashboard/usage", label: "Usage Data", short: "Usage Data" },
] as const

export default function DashboardTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Dashboard sections" className="flex items-baseline gap-3 sm:gap-4">
      {TABS.map((tab) => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`border-b-2 text-xl font-bold whitespace-nowrap transition-colors duration-100 sm:text-2xl ${
              isActive
                ? "border-brand text-gray-900"
                : "border-transparent text-gray-400 hover:text-gray-700 active:scale-95"
            }`}
          >
            <span className="sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
