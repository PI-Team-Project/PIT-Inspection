"use client"

import { useState } from "react"
import Image from "next/image"
import { submitInspection } from "./actions"
import { needsAttention, type Question } from "@/lib/questions"
import type { Equipment, EquipmentCategory, EquipmentType } from "@/lib/equipment"
import { SHIFTS } from "@/lib/shifts"

const EQUIPMENT_CATEGORIES: EquipmentCategory[] = ["Forklift", "Pallet Jack"]
const FORKLIFT_TYPES: EquipmentType[] = ["Sit Down", "Propane", "Standup"]
const INSPECTION_TYPES = ["Daily Inspection", "Repair Request"] as const

type StepDef =
  | { kind: "date" }
  | { kind: "name" }
  | { kind: "inspectionType" }
  | { kind: "repairPlaceholder" }
  | { kind: "shift" }
  | { kind: "equipment" }
  | { kind: "question"; question: Question }

export default function InspectionForm({
  questions,
  equipmentList,
  today,
}: {
  questions: Question[]
  equipmentList: Equipment[]
  today: string
}) {
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({
    date: today,
  })

  const steps: StepDef[] =
    values.inspectionType === "Repair Request"
      ? [
          { kind: "date" },
          { kind: "name" },
          { kind: "inspectionType" },
          { kind: "repairPlaceholder" },
        ]
      : [
          { kind: "date" },
          { kind: "name" },
          { kind: "inspectionType" },
          { kind: "shift" },
          { kind: "equipment" },
          ...questions.map((q) => ({ kind: "question" as const, question: q })),
        ]
  const [photoPreviews, setPhotoPreviews] = useState<
    Record<string, (string | null)[]>
  >({})

  const total = steps.length
  const isLast = step === total - 1
  const current = steps[step]
  const showGreeting = step >= 2 && Boolean(values.firstName?.trim())

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }))
  }

  function advance() {
    setStep((s) => Math.min(s + 1, total - 1))
  }

  function selectAndAdvance(name: string, value: string) {
    set(name, value)
    advance()
  }

  function setPhotoPreview(questionId: string, index: number, file: File | null) {
    setPhotoPreviews((prev) => {
      const slots = [...(prev[questionId] ?? [null, null, null, null])]
      slots[index] = file ? URL.createObjectURL(file) : null
      return { ...prev, [questionId]: slots }
    })
  }

  function stepIsAnswered(s: StepDef): boolean {
    if (s.kind === "date") return Boolean(values.date)
    if (s.kind === "name")
      return Boolean(values.lastName?.trim()) && Boolean(values.firstName?.trim())
    if (s.kind === "inspectionType") return Boolean(values.inspectionType)
    if (s.kind === "repairPlaceholder") return false
    if (s.kind === "shift") return Boolean(values.shift)
    if (s.kind === "equipment") return Boolean(values.equipmentSerial)
    const v = values[s.question.id]
    if (!v) return false
    if (v.startsWith("Other") && !values[`${s.question.id}_specify`]?.trim()) return false
    return true
  }

  const canAdvance = stepIsAnswered(current)
  const showContinue =
    !isLast &&
    (current.kind === "date" ||
      current.kind === "name" ||
      (current.kind === "question" &&
        Boolean(values[current.question.id]) &&
        needsAttention(values[current.question.id])))

  function handleNext() {
    if (!canAdvance) return
    advance()
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0))
  }

  return (
    <form action={submitInspection} className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-2">
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
        <p className="mt-3 text-sm text-gray-500">
          You&apos;re the first to notice. Thank you for checking.
        </p>
        {showGreeting && (
          <p className="mt-1.5 text-sm font-semibold text-blue-600">
            {timeOfDayIcon(new Date())} Hello, {values.firstName}!
          </p>
        )}
      </div>

      <div className="flex-1 px-4 pt-6 pb-6">
        {/* Date */}
        <div hidden={current.kind !== "date"}>
          <StepHeading text="Inspection Date" />
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

        {/* Inspection Type */}
        <div hidden={current.kind !== "inspectionType"}>
          <StepHeading text="What type of inspection is this?" />
          <div className="flex flex-col gap-5">
            {INSPECTION_TYPES.map((type) => {
              const isChecked = values.inspectionType === type
              return (
                <label
                  key={type}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-transform duration-100 active:scale-95 ${
                    isChecked ? "border-blue-600 bg-blue-50" : "border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="inspectionType"
                    value={type}
                    checked={isChecked}
                    onChange={() => selectAndAdvance("inspectionType", type)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isChecked ? "border-blue-600 bg-blue-600" : "border-gray-300"
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
                  <span className="text-base text-gray-800">{type}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Repair Request (not built yet) */}
        <div hidden={current.kind !== "repairPlaceholder"}>
          <StepHeading text="Repair Request" />
          <p className="text-sm text-gray-600">
            This flow isn&apos;t ready yet. For now, please go back and choose
            &quot;Daily Inspection&quot; to continue.
          </p>
        </div>

        {/* Shift */}
        <div hidden={current.kind !== "shift"}>
          <StepHeading text="Which shift are you on?" />
          <div className="flex flex-col gap-5">
            {SHIFTS.map((s) => {
              const isChecked = values.shift === s.name
              return (
                <label
                  key={s.name}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-transform duration-100 active:scale-95 ${
                    isChecked
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="shift"
                    value={s.name}
                    checked={isChecked}
                    onChange={() => selectAndAdvance("shift", s.name)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isChecked
                        ? "border-blue-600 bg-blue-600"
                        : "border-gray-300"
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
                  <span className="text-base text-gray-800">{s.name}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Equipment */}
        <div hidden={current.kind !== "equipment"}>
          <StepHeading text="Which equipment are you inspecting?" />

          <p className="mb-2 text-sm font-medium text-gray-700">
            Please select the type of the equipment
          </p>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_CATEGORIES.map((cat) => {
              const isChecked = values.equipmentCategory === cat
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    set("equipmentCategory", cat)
                    set("equipmentType", cat === "Pallet Jack" ? "Pallet Jack" : "")
                    set("equipmentMakeColor", "")
                    set("equipmentSerial", "")
                  }}
                  className={`flex-1 rounded-lg border px-4 py-3 text-base transition-transform duration-100 active:scale-95 ${
                    isChecked
                      ? "border-blue-600 bg-blue-50 font-semibold text-blue-700"
                      : "border-gray-300 text-gray-800"
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>

          {values.equipmentCategory === "Forklift" && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">
                Select forklift type
              </p>
              <div className="flex flex-wrap gap-2">
                {FORKLIFT_TYPES.map((type) => {
                  const isChecked = values.equipmentType === type
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        set("equipmentType", type)
                        set("equipmentMakeColor", "")
                        set("equipmentSerial", "")
                      }}
                      className={`flex-1 rounded-lg border px-3 py-3 text-sm transition-transform duration-100 active:scale-95 ${
                        isChecked
                          ? "border-blue-600 bg-blue-50 font-semibold text-blue-700"
                          : "border-gray-300 text-gray-800"
                      }`}
                    >
                      {type}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {values.equipmentType && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">
                Select color / make
              </p>
              {(() => {
                const colors = Array.from(
                  new Set(
                    equipmentList
                      .filter((eq) => eq.type === values.equipmentType)
                      .map((eq) => eq.makeColor)
                  )
                )
                if (colors.length === 0) {
                  return (
                    <p className="text-sm text-gray-500">
                      No {values.equipmentType} equipment on file yet.
                    </p>
                  )
                }
                return (
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => {
                      const isChecked = values.equipmentMakeColor === color
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            set("equipmentMakeColor", color)
                            set("equipmentSerial", "")
                          }}
                          className={`flex-1 rounded-lg border px-3 py-3 text-sm transition-transform duration-100 active:scale-95 ${
                            isChecked
                              ? "border-blue-600 bg-blue-50 font-semibold text-blue-700"
                              : "border-gray-300 text-gray-800"
                          }`}
                        >
                          {color}
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          {values.equipmentMakeColor && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Unit
              </label>
              {(() => {
                const matches = equipmentList.filter(
                  (eq) =>
                    eq.type === values.equipmentType &&
                    eq.makeColor === values.equipmentMakeColor
                )
                return (
                  <div className="grid grid-cols-4 gap-2">
                    {matches.map((eq) => {
                      const isChecked = values.equipmentSerial === eq.serial
                      const suffix = eq.flNumber.split("-").pop()
                      return (
                        <button
                          key={eq.serial}
                          type="button"
                          onClick={() => selectAndAdvance("equipmentSerial", eq.serial)}
                          className={`flex flex-col items-center rounded-lg border px-2 py-3 transition-transform duration-100 active:scale-95 ${
                            isChecked
                              ? "border-blue-600 bg-blue-50"
                              : "border-gray-300"
                          }`}
                        >
                          <span
                            className={`text-lg font-semibold ${
                              isChecked ? "text-blue-700" : "text-gray-900"
                            }`}
                          >
                            {suffix}
                          </span>
                          <span className="mt-0.5 text-[11px] text-gray-500">
                            {eq.flNumber}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          <input type="hidden" name="equipmentSerial" value={values.equipmentSerial ?? ""} />
        </div>

        {/* Questions */}
        {questions.map((q) => (
          <div key={q.id} hidden={!(current.kind === "question" && current.question.id === q.id)}>
            <StepHeading text={`${q.number}. ${q.label}`} />
            {q.note && <p className="mb-3 text-sm text-gray-500">{q.note}</p>}
            <div className="flex flex-col gap-5">
              {q.options.map((opt) => {
                const isChecked = values[q.id] === opt
                return (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-transform duration-100 active:scale-95 ${
                      isChecked
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={isChecked}
                      onChange={() => {
                        set(q.id, opt)
                        if (!needsAttention(opt)) advance()
                      }}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        isChecked
                          ? "border-blue-600 bg-blue-600"
                          : "border-gray-300"
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
            {Boolean(values[q.id]) && needsAttention(values[q.id]) && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Photos
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((i) => {
                      const preview = photoPreviews[q.id]?.[i]
                      return (
                        <label
                          key={i}
                          className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-gray-50"
                        >
                          <input
                            type="file"
                            accept="image/*"
                            name={`${q.id}_photo`}
                            className="sr-only"
                            onChange={(e) =>
                              setPhotoPreview(q.id, i, e.target.files?.[0] ?? null)
                            }
                          />
                          {preview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={preview}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <CameraIcon className="h-6 w-6 text-gray-400" />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Note
                  </label>
                  <textarea
                    name={`${q.id}_note`}
                    rows={3}
                    placeholder="Describe in as much detail as possible"
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-gray-100 bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="shrink-0 px-1 py-3 text-sm font-medium text-gray-500 transition-transform duration-100 active:scale-95 active:text-gray-700"
            >
              ← Back
            </button>
          )}
          {isLast && current.kind !== "repairPlaceholder" ? (
            <button
              type="submit"
              disabled={!canAdvance}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:active:scale-100"
            >
              Submit Inspection
            </button>
          ) : (
            showContinue && (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:active:scale-100"
              >
                Continue
              </button>
            )
          )}
        </div>

        <div className="flex justify-center pt-3">
          <Image
            src="/lx-pantos-logo.png"
            alt="LX Pantos"
            width={100}
            height={28}
            className="opacity-70"
          />
        </div>
      </div>
    </form>
  )
}

// 새벽 (dawn) / 낮 (day) / 밤 (night), based on the inspector's local clock.
function timeOfDayIcon(date: Date): string {
  const hour = date.getHours()
  if (hour < 6) return "🌅"
  if (hour < 18) return "☀️"
  return "🌙"
}

function StepHeading({ text }: { text: string }) {
  return <h2 className="mt-6 mb-6 text-xl font-bold text-gray-900">{text}</h2>
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}
