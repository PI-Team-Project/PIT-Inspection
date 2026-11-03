"use client"

import { useRouter } from "next/navigation"
import { USAGE_RANGES, type UsageRange } from "@/lib/fleetUsage"

export default function RangeSelect({ value }: { value: UsageRange }) {
  const router = useRouter()
  return (
    <select
      aria-label="Period"
      value={value}
      onChange={(e) => router.push(`/dashboard/usage?range=${e.target.value}`, { scroll: false })}
      className="rounded-md border border-gray-200 bg-white py-1 pr-7 pl-2.5 text-sm font-medium text-gray-900"
    >
      {USAGE_RANGES.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
        </option>
      ))}
    </select>
  )
}
