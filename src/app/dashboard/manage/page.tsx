import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { equipmentTypeLabel, type Equipment } from "@/lib/equipment"
import { getAllEquipmentIncludingRetired, RETENTION_DAYS } from "@/lib/equipmentLocations"
import { DASHBOARD_COOKIE, MANAGER_NAME_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { restoreVehicle } from "./actions"
import AddVehicleForm from "./AddVehicleForm"
import EditVehicleControl from "./EditVehicleControl"

// The trailing action column is a fixed width, not `auto` — an `auto`
// track sizes to its row's own content, and the header row's action cell
// is empty while data rows have a real button, so the two would compute
// different track widths and throw every `fr` column out of alignment.
const ACTIVE_COLS = "grid-cols-[1fr_0.7fr_1.2fr_2rem] sm:grid-cols-[1.1fr_0.8fr_1.3fr_0.7fr_1fr_1.3fr_2rem]"
const RETIRED_COLS = "grid-cols-[1fr_0.7fr_0.9fr_4rem] sm:grid-cols-[1.1fr_0.8fr_1.3fr_0.9fr_0.9fr_0.9fr_4rem]"
// Contract/Location/Serial# (active) and Make-Color/Retired By/Retired On
// (retired) only show at sm+ — narrow phones get the essentials plus the
// action, everything else is one tap away in the edit popup.
const HIDE_ON_MOBILE = "hidden sm:block"

const SORT_FIELDS = {
  flNumber: (eq: Equipment) => eq.flNumber,
  type: (eq: Equipment) => equipmentTypeLabel(eq.type),
  makeColor: (eq: Equipment) => eq.makeColor,
  contractType: (eq: Equipment) => eq.contractType,
  location: (eq: Equipment) => eq.location,
  serial: (eq: Equipment) => eq.serial,
} as const
type SortField = keyof typeof SORT_FIELDS

function isSortField(value: string): value is SortField {
  return value in SORT_FIELDS
}

function SortableHeader({
  field,
  label,
  sort,
  dir,
  className,
}: {
  field: SortField
  label: string
  sort: SortField
  dir: "asc" | "desc"
  className?: string
}) {
  const active = sort === field
  const nextDir = active && dir === "asc" ? "desc" : "asc"
  return (
    <Link
      href={`/dashboard/manage?sort=${field}&dir=${nextDir}`}
      scroll={false}
      className={`${className ?? "flex"} items-center gap-0.5 hover:text-gray-700 ${active ? "text-gray-700" : ""}`}
    >
      {label}
      {active && <span>{dir === "asc" ? "▲" : "▼"}</span>}
    </Link>
  )
}

export default async function ManageVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>
}) {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) redirect("/dashboard")

  const params = await searchParams
  const sort: SortField = params.sort && isSortField(params.sort) ? params.sort : "flNumber"
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc"

  const savedManagerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value ?? ""
  const all = await getAllEquipmentIncludingRetired()
  const getField = SORT_FIELDS[sort]
  const compare = (a: Equipment, b: Equipment) => {
    const cmp = getField(a).localeCompare(getField(b))
    return dir === "asc" ? cmp : -cmp
  }
  const active = all.filter((eq) => !eq.retiredAt).sort(compare)
  const retired = all.filter((eq) => eq.retiredAt).sort(compare)

  return (
    <main className="mx-auto max-w-lg px-4 py-8 sm:max-w-2xl lg:max-w-5xl">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 active:scale-95"
          aria-label="Back to dashboard"
        >
          ←
        </Link>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Manage Vehicles</h1>
        <div className="ml-auto">
          <AddVehicleForm savedManagerName={savedManagerName} />
        </div>
      </div>

      <p className="mt-2 ml-12 text-sm text-gray-500">
        Add, edit, or retire vehicles in the fleet. Retiring a vehicle keeps its history on
        file for 2 years and hides it from the dashboard and inspection form.
      </p>

      <div className="mt-6 rounded-lg border border-gray-200">
        <div
          className={`grid ${ACTIVE_COLS} gap-1.5 border-b border-gray-300 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs`}
        >
          <SortableHeader field="flNumber" label="FL#" sort={sort} dir={dir} />
          <SortableHeader field="type" label="Type" sort={sort} dir={dir} />
          <SortableHeader field="makeColor" label="Make / Color" sort={sort} dir={dir} />
          <SortableHeader
            field="contractType"
            label="Contract"
            sort={sort}
            dir={dir}
            className="hidden sm:flex"
          />
          <SortableHeader
            field="location"
            label="Location"
            sort={sort}
            dir={dir}
            className="hidden sm:flex"
          />
          <SortableHeader
            field="serial"
            label="Serial#"
            sort={sort}
            dir={dir}
            className="hidden sm:flex"
          />
          <span></span>
        </div>
        {active.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-400">No active vehicles.</p>
        ) : (
          active.map((eq) => (
            <div
              key={eq.serial}
              className={`grid ${ACTIVE_COLS} items-center gap-1.5 border-b border-gray-100 px-2 py-1.5 text-xs last:border-b-0 hover:bg-gray-50 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm`}
            >
              <span className="truncate font-medium text-gray-900">{eq.flNumber}</span>
              <span className="truncate text-gray-600">{equipmentTypeLabel(eq.type)}</span>
              <span className="truncate text-gray-700">{eq.makeColor}</span>
              <span className={`truncate text-gray-600 ${HIDE_ON_MOBILE}`}>{eq.contractType}</span>
              <span className={`truncate text-gray-600 ${HIDE_ON_MOBILE}`}>{eq.location}</span>
              <span className={`truncate text-gray-400 ${HIDE_ON_MOBILE}`}>{eq.serial}</span>
              <EditVehicleControl equipment={eq} savedManagerName={savedManagerName} />
            </div>
          ))
        )}
      </div>

      <h2 className="mt-8 mb-1.5 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        Retired Vehicles ({retired.length})
      </h2>
      <div className="rounded-lg border border-gray-200 bg-gray-50/60">
        <div
          className={`grid ${RETIRED_COLS} gap-1.5 border-b border-gray-200 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 sm:gap-2 sm:px-3 sm:py-2 sm:text-xs`}
        >
          <span>FL#</span>
          <span>Type</span>
          <span className={HIDE_ON_MOBILE}>Make / Color</span>
          <span className={HIDE_ON_MOBILE}>Retired By</span>
          <span className={HIDE_ON_MOBILE}>Retired On</span>
          <span>Expires On</span>
          <span></span>
        </div>
        {retired.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-400">No retired vehicles.</p>
        ) : (
          retired.map((eq) => {
            const retiredAt = eq.retiredAt as Date
            const expiresAt = new Date(retiredAt.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000)
            return (
              <div
                key={eq.serial}
                className={`grid ${RETIRED_COLS} items-center gap-1.5 border-b border-gray-200 px-2 py-1.5 text-xs text-gray-400 last:border-b-0 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm`}
              >
                <span className="truncate line-through">{eq.flNumber}</span>
                <span className="truncate">{equipmentTypeLabel(eq.type)}</span>
                <span className={`truncate ${HIDE_ON_MOBILE}`}>{eq.makeColor}</span>
                <span className={`truncate ${HIDE_ON_MOBILE}`}>{eq.retiredBy ?? "—"}</span>
                <span className={`truncate ${HIDE_ON_MOBILE}`}>
                  {retiredAt.toISOString().slice(0, 10)}
                </span>
                <span className="truncate">{expiresAt.toISOString().slice(0, 10)}</span>
                <form action={restoreVehicle}>
                  <input type="hidden" name="serial" value={eq.serial} />
                  <button
                    type="submit"
                    className="rounded-md px-1.5 py-1 text-[11px] font-medium text-brand hover:bg-brand/10 active:scale-95 sm:px-2 sm:text-xs"
                  >
                    Restore
                  </button>
                </form>
              </div>
            )
          })
        )}
      </div>
    </main>
  )
}
