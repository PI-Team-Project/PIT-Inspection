"use client"

import { useActionState } from "react"
import { approvePendingLocation, dismissPendingLocation } from "./actions"

// Sits right next to LocationChangeControl on the equipment detail page —
// an inspector's reported location shows up here as a claim needing a
// supervisor's sign-off, never as the equipment's displayed location
// itself, until Approve is pressed.
export default function PendingLocationApproval({
  serial,
  pendingLocation,
  reportedBy,
  reportedAtDisplay,
  savedManagerName,
}: {
  serial: string
  pendingLocation: string
  reportedBy: string
  reportedAtDisplay: string
  savedManagerName: string
}) {
  const [, approveAction, approving] = useActionState(approvePendingLocation, null)
  const [, dismissAction, dismissing] = useActionState(dismissPendingLocation, null)
  const busy = approving || dismissing

  return (
    <div className="col-span-3 flex flex-col gap-1.5 border-b border-amber-200 bg-amber-50 px-2 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <p className="text-amber-800">
        <span className="font-semibold">📍 Location change reported:</span> {reportedBy} says
        this is now at <span className="font-semibold">{pendingLocation}</span> ({reportedAtDisplay}) —
        needs your approval.
      </p>
      <div className="flex shrink-0 gap-1.5">
        <form action={approveAction}>
          <input type="hidden" name="serial" value={serial} />
          <input type="hidden" name="managerName" value={savedManagerName} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white transition-transform duration-100 active:scale-95 disabled:opacity-50"
          >
            {approving ? "Approving…" : "Approve"}
          </button>
        </form>
        <form action={dismissAction}>
          <input type="hidden" name="serial" value={serial} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-semibold text-amber-700 transition-transform duration-100 active:scale-95 disabled:opacity-50"
          >
            {dismissing ? "Dismissing…" : "Dismiss"}
          </button>
        </form>
      </div>
    </div>
  )
}
