"use client"

import { useFormStatus } from "react-dom"

// useFormStatus only reports the enclosing <form>'s pending state when read
// from a component rendered *inside* it, not from the (server) component
// that renders the <form> tag itself — hence this tiny client component.
export default function SignConfirmButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-base font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark disabled:cursor-not-allowed disabled:bg-gray-300 disabled:active:scale-100"
    >
      {pending ? "Saving…" : "✓ Sign & Confirm"}
    </button>
  )
}
