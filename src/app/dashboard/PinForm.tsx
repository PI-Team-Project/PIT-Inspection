"use client"

import { unlockDashboard } from "./actions"
import HomeLink from "./HomeLink"

export default function PinForm({
  error,
  lockedMinutes,
}: {
  error?: boolean
  lockedMinutes?: number
}) {
  const locked = Boolean(lockedMinutes)
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col items-center px-4 py-16">
      <div className="mb-2 self-start">
        <HomeLink />
      </div>
      <h1 className="text-xl font-bold text-gray-900">Manager Dashboard</h1>
      <p className="mt-1 text-sm text-gray-600">Enter 6-digit PIN</p>
      <form action={unlockDashboard} className="mt-6 w-full space-y-3">
        <input
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          name="pin"
          required
          autoFocus
          disabled={locked}
          aria-label="6-digit PIN"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.5em] disabled:bg-gray-100 disabled:text-gray-400"
        />
        {locked ? (
          <p className="text-center text-sm text-red-600">
            Too many incorrect attempts. Try again in {lockedMinutes} minute
            {lockedMinutes === 1 ? "" : "s"}.
          </p>
        ) : (
          error && (
            <p className="text-center text-sm text-red-600">
              Incorrect PIN. Try again.
            </p>
          )
        )}
        <button
          type="submit"
          disabled={locked}
          className="w-full rounded-lg bg-brand px-4 py-3 font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    </main>
  )
}
