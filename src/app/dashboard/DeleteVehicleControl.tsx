"use client"

import { useActionState, useState } from "react"
import { archiveEquipment } from "./actions"

export default function DeleteVehicleControl({
  serial,
  flNumber,
}: {
  serial: string
  flNumber: string
}) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [state, formAction, pending] = useActionState(archiveEquipment, { error: null })

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-red-600 hover:underline"
      >
        Remove this vehicle
      </button>
    )
  }

  return (
    <form
      action={formAction}
      className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3"
    >
      <input type="hidden" name="serial" value={serial} />
      <p className="text-xs text-red-800">
        This removes <strong>{flNumber}</strong> from the dashboard and the
        inspection form immediately. Its past inspections stay on record.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={`Type ${flNumber} to confirm`}
        autoComplete="off"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      />
      <input
        type="password"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        name="pin"
        placeholder="Manager PIN"
        required
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tracking-widest"
      />
      {state.error && (
        <p className="text-xs font-semibold text-red-700">{state.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setConfirmText("")
          }}
          className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 active:scale-95"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={confirmText !== flNumber || pending}
          className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white transition-transform duration-100 active:scale-95 disabled:opacity-40"
        >
          {pending ? "Removing…" : "Remove vehicle"}
        </button>
      </div>
    </form>
  )
}
