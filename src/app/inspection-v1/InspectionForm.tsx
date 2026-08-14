"use client"

import { useState } from "react"
import { submitInspection } from "../inspection/actions"
import type { Question } from "@/lib/questions"
import type { Equipment } from "@/lib/equipment"

export default function InspectionForm({
  questions,
  equipmentList,
  today,
}: {
  questions: Question[]
  equipmentList: Equipment[]
  today: string
}) {
  const [selected, setSelected] = useState<Record<string, string>>({})

  return (
    <form action={submitInspection} className="space-y-8">
      <Field number={1} label="Inspection Date">
        <input
          type="date"
          name="date"
          defaultValue={today}
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
        />
      </Field>

      <Field number={2} label="Last Name">
        <input
          type="text"
          name="lastName"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
        />
      </Field>

      <Field number={3} label="First Name">
        <input
          type="text"
          name="firstName"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
        />
      </Field>

      <Field
        number={5}
        label="Which equipment are you inspecting?"
        note="Serial# is on the data plate."
      >
        <select
          name="equipmentSerial"
          required
          defaultValue=""
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
        >
          <option value="" disabled>
            Select equipment
          </option>
          {equipmentList.map((eq) => (
            <option key={eq.serial} value={eq.serial}>
              {eq.flNumber} — {eq.makeColor} ({eq.type})
            </option>
          ))}
        </select>
      </Field>

      {questions.map((q) => (
        <Field key={q.id} number={q.number} label={q.label} note={q.note}>
          <div className="flex flex-col gap-2.5">
            {q.options.map((opt) => {
              const isChecked = selected[q.id] === opt
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-transform duration-100 active:scale-95 ${
                    isChecked ? "border-brand bg-brand/10" : "border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    required
                    checked={isChecked}
                    onChange={() => setSelected((s) => ({ ...s, [q.id]: opt }))}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isChecked ? "border-brand bg-brand" : "border-gray-300"
                    }`}
                  >
                    {isChecked && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span className="text-base text-gray-800">{opt}</span>
                </label>
              )
            })}
          </div>
          {selected[q.id]?.startsWith("Other") && (
            <input
              type="text"
              name={`${q.id}_specify`}
              placeholder="Please specify"
              required
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
            />
          )}
        </Field>
      ))}

      <div className="pt-6">
        <button
          type="submit"
          className="w-full rounded-lg bg-brand px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
        >
          Submit Inspection
        </button>
      </div>
    </form>
  )
}

function Field({
  number,
  label,
  note,
  children,
}: {
  number: number
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 text-base font-semibold text-gray-900">
        {number}. {label}
      </legend>
      {note && <p className="mb-1.5 text-sm text-gray-500">{note}</p>}
      {children}
    </fieldset>
  )
}
