"use client"

import { unlockDashboard } from "./actions"
import HomeLink from "./HomeLink"

export default function PinForm({ error }: { error?: boolean }) {
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
          aria-label="6-digit PIN"
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-[0.5em]"
        />
        {error && (
          <p className="text-center text-sm text-red-600">
            Incorrect PIN. Try again.
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700"
        >
          Unlock
        </button>
      </form>
    </main>
  )
}
