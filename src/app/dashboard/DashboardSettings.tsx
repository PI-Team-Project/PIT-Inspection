"use client"

import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { changeDashboardPin, type ChangePinState } from "./actions"

function UpdateButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Updating…" : "Update PIN"}
    </button>
  )
}

const pinInputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-lg tracking-[0.4em] placeholder:tracking-normal placeholder:text-sm"

// A dashboard utility, deliberately styled as the quiet one in the footer
// row: no bordered box (unlike Manage Vehicles / Export beside it), just an
// icon and label — it's a settings affordance, not a primary action. Opens
// a popup (the same modal pattern the Export options use) rather than
// expanding inline.
export default function DashboardSettings({
  triggerClassName,
}: {
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [state, formAction] = useActionState<ChangePinState, FormData>(changeDashboardPin, {
    error: null,
    ok: false,
  })

  const gear = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors duration-100 hover:text-brand active:scale-95"
        }
      >
        {gear}
        Settings
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-bold text-gray-900">
            {gear}
            Settings
          </h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-full p-1 text-gray-400 active:scale-95 active:bg-gray-100"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        <p className="text-sm font-semibold text-gray-800">Change dashboard PIN</p>
        <p className="mt-0.5 text-xs text-gray-500">Takes effect the next time someone signs in.</p>

        {/* key on ok so the fields (and message) reset after a successful change */}
        <form key={state.ok ? "done" : "form"} action={formAction} className="mt-3 space-y-2.5">
          <input
            type="password"
            name="currentPin"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoComplete="off"
            aria-label="Current PIN"
            placeholder="Current PIN"
            className={pinInputClass}
          />
          <input
            type="password"
            name="newPin"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoComplete="off"
            aria-label="New 6-digit PIN"
            placeholder="New 6-digit PIN"
            className={pinInputClass}
          />
          <input
            type="password"
            name="confirmPin"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoComplete="off"
            aria-label="Confirm new PIN"
            placeholder="Confirm new PIN"
            className={pinInputClass}
          />
          {state.error && <p className="text-xs font-medium text-red-600">{state.error}</p>}
          {state.ok && (
            <p className="text-xs font-medium text-green-700">
              PIN updated. Use the new one next time you sign in.
            </p>
          )}
          <UpdateButton />
        </form>
      </div>
    </div>
  )
}
