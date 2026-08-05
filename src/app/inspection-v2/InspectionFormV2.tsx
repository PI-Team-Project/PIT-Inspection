"use client"

import { useState } from "react"
import { submitInspection } from "../inspection/actions"
import type { Question } from "@/lib/questions"
import type { Equipment } from "@/lib/equipment"

export default function InspectionFormV2({
  questions,
  equipmentList,
  today,
}: {
  questions: Question[]
  equipmentList: Equipment[]
  today: string
}) {
  const [selected, setSelected] = useState<Record<string, string>>({})

  const answeredCount = questions.filter((q) => selected[q.id]).length
  const total = questions.length
  const percent = Math.round((answeredCount / total) * 100)

  return (
    <form action={submitInspection} className="space-y-8">
      <div className="sticky top-0 z-10 -mx-4 mb-2 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="text-xs text-gray-600">
          {answeredCount}/{total} answered
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">PIT Inspection</h1>
        <p className="mt-1 text-sm text-gray-600">
          Inspection must be completed at beginning of every shift to ensure
          equipment is good condition to use.
        </p>
      </div>

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

      <div className="space-y-8">
        {questions.map((q) => (
          <Field key={q.id} number={q.number} label={q.label} note={q.note}>
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => {
                const isOther = opt.startsWith("Other")
                const qualifierMatch = !isOther && opt.match(/^(.+?)\s\((.+)\)$/)
                const isChecked = selected[q.id] === opt
                const textColor = isChecked ? "text-blue-700" : "text-gray-800"
                return (
                  <label
                    key={opt}
                    className={`relative flex min-h-16 min-w-[80px] flex-1 basis-0 items-center justify-center rounded-lg border px-2 py-3 text-center text-sm leading-snug transition-transform duration-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 active:scale-95 ${
                      isChecked
                        ? "border-blue-600 bg-blue-50 font-semibold"
                        : "border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      required
                      checked={isChecked}
                      onChange={() =>
                        setSelected((s) => ({ ...s, [q.id]: opt }))
                      }
                      className="sr-only"
                    />
                    {isChecked && (
                      <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-2.5 w-2.5"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                    )}
                    {isOther ? (
                      <span className={textColor}>Other</span>
                    ) : qualifierMatch ? (
                      <span className="flex flex-col items-center">
                        <span className={textColor}>{qualifierMatch[1]}</span>
                        <span className="text-xs text-sky-600">
                          {qualifierMatch[2]}
                        </span>
                      </span>
                    ) : (
                      <span className={textColor}>{opt}</span>
                    )}
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
      </div>

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
      <legend className="mb-1 text-base font-semibold text-gray-900">
        {number}. {label}
      </legend>
      {note && <p className="mb-1.5 text-sm text-gray-500">{note}</p>}
      {children}
    </fieldset>
  )
}
