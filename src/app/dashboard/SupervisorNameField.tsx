"use client"

import { useState } from "react"
import { SUPERVISORS, OTHER_SUPERVISOR } from "@/lib/supervisors"

// Pick a supervisor instead of typing one. Used everywhere the app captures
// a signature, so a name is spelled the same way every time — see
// src/lib/supervisors.ts for why that matters.
//
// The select is never itself the submitted field. A hidden input carries the
// value under whatever name the server action already expects, so the picker
// dropped into three different forms without any of their actions changing.
export default function SupervisorNameField({
  name,
  savedManagerName,
  label = "Supervisor Signature",
  labelClassName = "mb-1 block text-sm font-medium text-gray-700",
  className = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base",
}: {
  name: string
  savedManagerName: string
  label?: string
  labelClassName?: string
  className?: string
}) {
  const saved = savedManagerName.trim()
  // A remembered name that is no longer on the roster (someone who has left,
  // or a one-off) opens as "someone else" with the name still filled in —
  // never silently swapped for a supervisor who did not sign this.
  const savedIsRoster = (SUPERVISORS as readonly string[]).includes(saved)
  const [choice, setChoice] = useState<string>(
    savedIsRoster ? saved : saved ? OTHER_SUPERVISOR : SUPERVISORS[0]
  )
  const [typed, setTyped] = useState(savedIsRoster ? "" : saved)

  const isOther = choice === OTHER_SUPERVISOR
  const value = isOther ? typed : choice

  return (
    <div>
      <label htmlFor={`${name}-select`} className={labelClassName}>
        {label}
      </label>
      {/* The value that actually submits. Kept separate from the controls so
          the server action sees the same field it always did, whichever way
          the name was chosen. */}
      <input type="hidden" name={name} value={value} />
      <select
        id={`${name}-select`}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className={className}
      >
        {SUPERVISORS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
        <option value={OTHER_SUPERVISOR}>Someone else — type a name</option>
      </select>
      {isOther && (
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Name of the supervisor"
          // `required` lives here rather than on the hidden input, which a
          // browser will not validate: picking "someone else" and leaving
          // this blank has to block the submit, not sign with an empty name.
          required
          autoFocus
          className={`mt-2 ${className}`}
        />
      )}
    </div>
  )
}
