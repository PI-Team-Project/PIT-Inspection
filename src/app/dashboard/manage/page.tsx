import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { equipmentTypeLabel, type Equipment } from "@/lib/equipment"
import { getAllEquipmentIncludingRetired, RETENTION_DAYS } from "@/lib/equipmentLocations"
import { DASHBOARD_COOKIE, MANAGER_NAME_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { restoreVehicle } from "./actions"
import ActiveVehiclesTable from "./ActiveVehiclesTable"
import { RETIRED_COLS, HIDE_ON_MOBILE, SORT_FIELDS, isSortField, type SortField } from "./tableShared"

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
    <main className="mx-auto max-w-lg px-4 py-8 sm:max-w-2xl lg:max-w-4xl">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-600"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 111.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        Dashboard
      </Link>

      <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Manage Vehicles</h1>
      <p className="mt-1 text-sm text-gray-500">Add, edit, or retire vehicles in the fleet.</p>

      <div className="mt-3 border-t border-gray-100" />

      <div className="mt-6">
        <ActiveVehiclesTable
          active={active}
          savedManagerName={savedManagerName}
          sort={sort}
          dir={dir}
        />
      </div>

      <h2 className="mt-8 mb-1.5 text-xs font-semibold tracking-wide text-gray-400 uppercase">
        Retired Vehicles ({retired.length})
      </h2>
      <p className="mb-2 text-xs text-gray-500">
        Retiring a vehicle keeps its history on file for 2 years and hides it from the
        dashboard and inspection form.
      </p>
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
