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
      <Field number={1} label="Date">
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

      <Field number={5} label="Equipment (Serial# on data plate)">
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
              {eq.label} — {eq.serial}
            </option>
          ))}
        </select>
      </Field>

      {questions.map((q) => (
        <Field key={q.id} number={q.number} label={q.label} note={q.note}>
          <div className="flex flex-col gap-2.5">
            {q.options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-3 rounded-lg border border-gray-300 px-4 py-3 transition-transform duration-100 has-checked:border-blue-600 has-checked:bg-blue-50 active:scale-95 active:bg-gray-50"
              >
                <input
                  type="radio"
                  name={q.id}
                  value={opt}
                  required
                  onChange={() => setSelected((s) => ({ ...s, [q.id]: opt }))}
                  className="h-4 w-4"
                />
                <span className="text-base text-gray-800">{opt}</span>
              </label>
            ))}
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
          className="w-full rounded-lg bg-blue-600 px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700"
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
      <legend className="mb-1.5 text-base font-semibold text-gray-900">
        {number}. {label}
      </legend>
      {note && <p className="mb-1.5 text-sm text-gray-500">{note}</p>}
      {children}
    </fieldset>
  )
}
