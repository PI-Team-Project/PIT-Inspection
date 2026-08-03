"use client"

import { useState } from "react"
import { submitInspection } from "../inspection/actions"
import type { Question } from "@/lib/questions"
import type { Equipment } from "@/lib/equipment"

type StepDef =
  | { kind: "date" }
  | { kind: "name" }
  | { kind: "equipment" }
  | { kind: "question"; question: Question }

export default function InspectionFormV3({
  questions,
  equipmentList,
  today,
}: {
  questions: Question[]
  equipmentList: Equipment[]
  today: string
}) {
  const steps: StepDef[] = [
    { kind: "date" },
    { kind: "name" },
    { kind: "equipment" },
    ...questions.map((q) => ({ kind: "question" as const, question: q })),
  ]

  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({
    date: today,
  })

  const total = steps.length
  const isLast = step === total - 1
  const current = steps[step]
  const showGreeting = step >= 2 && Boolean(values.firstName?.trim())

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }))
  }

  function stepIsAnswered(s: StepDef): boolean {
    if (s.kind === "date") return Boolean(values.date)
    if (s.kind === "name")
      return Boolean(values.lastName?.trim()) && Boolean(values.firstName?.trim())
    if (s.kind === "equipment") return Boolean(values.equipmentSerial)
    const v = values[s.question.id]
    if (!v) return false
    if (v.startsWith("Other")) return Boolean(values[`${s.question.id}_specify`]?.trim())
    return true
  }

  const canAdvance = stepIsAnswered(current)

  function handleNext() {
    if (!canAdvance) return
    setStep((s) => Math.min(s + 1, total - 1))
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  return (
    <form action={submitInspection} className="flex flex-1 flex-col px-4 py-6">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>
            {step + 1} / {total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-200"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center py-10">
        {showGreeting && (
          <p className="mb-2 text-sm font-semibold text-blue-600">
            Hello, {values.firstName}!
          </p>
        )}

        {/* Date */}
        <div hidden={current.kind !== "date"}>
          <StepHeading text="Date" />
          <input
            type="date"
            name="date"
            value={values.date ?? ""}
            onChange={(e) => set("date", e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {/* Name (last + first, one step, two sections) */}
        <div hidden={current.kind !== "name"}>
          <StepHeading text="Your Name" />
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Last Name
              </label>
              <input
                type="text"
                name="lastName"
                value={values.lastName ?? ""}
                onChange={(e) => set("lastName", e.target.value)}
                required
                autoFocus={current.kind === "name"}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                First Name
              </label>
              <input
                type="text"
                name="firstName"
                value={values.firstName ?? ""}
                onChange={(e) => set("firstName", e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
              />
            </div>
          </div>
        </div>

        {/* Equipment */}
        <div hidden={current.kind !== "equipment"}>
          <StepHeading text="Equipment (Serial# on data plate)" />
          <select
            name="equipmentSerial"
            value={values.equipmentSerial ?? ""}
            onChange={(e) => set("equipmentSerial", e.target.value)}
            required
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
        </div>

        {/* Questions */}
        {questions.map((q) => (
          <div key={q.id} hidden={!(current.kind === "question" && current.question.id === q.id)}>
            <StepHeading text={`${q.number}. ${q.label}`} />
            {q.note && <p className="mb-3 text-sm text-gray-500">{q.note}</p>}
            <div className="flex flex-col gap-2.5">
              {q.options.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-3 rounded-lg border border-gray-300 px-4 py-3 transition-transform duration-100 has-checked:border-blue-600 has-checked:bg-blue-50 active:scale-95"
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={values[q.id] === opt}
                    onChange={() => set(q.id, opt)}
                    className="h-4 w-4"
                  />
                  <span className="text-base text-gray-800">{opt}</span>
                </label>
              ))}
            </div>
            {values[q.id]?.startsWith("Other") && (
              <input
                type="text"
                name={`${q.id}_specify`}
                value={values[`${q.id}_specify`] ?? ""}
                onChange={(e) => set(`${q.id}_specify`, e.target.value)}
                placeholder="Please specify"
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
              />
            )}
          </div>
        ))}

        {!canAdvance && (
          <p className="mt-3 text-sm text-gray-500">Answer to continue.</p>
        )}
      </div>

      <div className="flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-4 text-lg font-semibold text-gray-700 transition-transform duration-100 active:scale-95 active:bg-gray-100"
          >
            Back
          </button>
        )}
        {isLast ? (
          <button
            type="submit"
            disabled={!canAdvance}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:active:scale-100"
          >
            Submit Inspection
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:active:scale-100"
          >
            Next
          </button>
        )}
      </div>
    </form>
  )
}

function StepHeading({ text }: { text: string }) {
  return <h2 className="mb-3 text-xl font-bold text-gray-900">{text}</h2>
}
