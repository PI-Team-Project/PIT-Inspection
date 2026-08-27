"use client"

import { useEffect, useRef, useState, type FocusEvent as ReactFocusEvent } from "react"
import { useFormStatus } from "react-dom"
import NextImage from "next/image"
import { submitInspection } from "./actions"
import {
  saveInspectionDraft,
  loadInspectionDraft,
  clearInspectionDraft,
  isDraftMeaningful,
  type InspectionDraft,
} from "@/lib/inspectionDraft"
import {
  needsAttention,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_PHOTO_SLOTS,
  CHECKLIST_PHOTO_SLOTS,
  type Question,
} from "@/lib/questions"
import {
  equipmentTypeLabel,
  LOCATIONS,
  type Equipment,
  type EquipmentCategory,
  type EquipmentType,
} from "@/lib/equipment"
import { SHIFTS, FLEET_TIME_ZONE, getShiftForDate } from "@/lib/shifts"

function formatEasternTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)
}

// A native <input type="date">'s displayed value follows the DEVICE'S OWN
// locale, not this app's — on a phone set to Korean (common for this
// warehouse's workers), iOS renders a noticeably wider value than the
// "mm/dd/yyyy" this was ever sized for, and the box just clips it instead
// of reflowing. Formatting it ourselves, in one fixed format everyone gets
// regardless of device locale, is what actually fixes that rather than
// just guessing at more padding.
function formatDateLabel(dateKey: string): string {
  if (!dateKey) return "Select a date"
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === "image/heic" || type === "image/heif") return true
  return /\.hei[cf]$/i.test(file.name)
}

// heic2any pulls in a WASM decoder, so it's loaded on demand rather than
// bundled for every visitor who never uploads a HEIC photo.
async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 })
  const blob = Array.isArray(result) ? result[0] : result
  const name = file.name.replace(/\.hei[cf]$/i, "") + ".jpg"
  return new File([blob], name, { type: "image/jpeg" })
}

// The actual submission reads native <input type="file"> elements, so a
// converted/cropped replacement has to be written back onto the input
// itself (not just kept in React state) for it to be what gets uploaded.
function setInputFiles(input: HTMLInputElement | null, file: File | null) {
  if (!input) return
  const dt = new DataTransfer()
  if (file) dt.items.add(file)
  input.files = dt.files
}

// Keyed by the `?error=` code actions.ts redirects back with on a rejected
// or failed submission — see submitInspection in ./actions.ts.
const SUBMIT_ERROR_MESSAGES: Record<string, string> = {
  "missing-fields": "Some required fields were missing — please fill out the form again.",
  "unknown-equipment": "That vehicle couldn't be found — please pick a vehicle again.",
  "equipment-retired": "This vehicle was just retired — please choose a different vehicle.",
  "submit-failed": "Something went wrong submitting your inspection. Please try again.",
}

// useFormStatus only reports the enclosing <form>'s pending state when
// called from a component rendered *inside* it — reading it in the same
// component that renders the <form> tag itself always sees pending=false,
// which is why this is split out rather than inlined at the call site.
function SubmitButton({ blocked }: { blocked: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={blocked}
      onClick={(e) => {
        if (blocked) e.preventDefault()
      }}
      className={`flex-1 rounded-lg px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 ${
        blocked || pending
          ? "cursor-not-allowed bg-gray-300 active:scale-100"
          : "bg-brand active:bg-brand-dark"
      }`}
    >
      {pending ? "Submitting…" : "Submit Inspection"}
    </button>
  )
}

const EQUIPMENT_CATEGORIES: EquipmentCategory[] = ["Forklift", "Pallet Jack"]
const FORKLIFT_TYPES: EquipmentType[] = ["Sit Down", "Propane", "Standup"]

const EQUIPMENT_IMAGES: Record<string, string> = {
  "Sit Down": "/equipment/sit-down.png",
  Propane: "/equipment/propane.png",
  Standup: "/equipment/standup.png",
  "Pallet Jack": "/equipment/pallet-jack.png",
}
// `value` is the stable stored/compared identifier; `label` is just the
// button text, so wording can change without touching the data model.
const INSPECTION_TYPES = [
  { value: "Daily Inspection", label: "Daily Inspection" },
  { value: "Repair Request", label: "Repair / Manager Inspection Request 🚩" },
] as const

type StepDef =
  | { kind: "date" }
  | { kind: "name" }
  | { kind: "inspectionType" }
  | { kind: "repairDetails" }
  | { kind: "shift" }
  | { kind: "equipment" }
  | { kind: "locationCheck" }
  | { kind: "question"; question: Question }

export default function InspectionForm({
  questions,
  equipmentList,
  today,
  recentlyInspected,
  initialError,
}: {
  questions: Question[]
  equipmentList: Equipment[]
  today: string
  recentlyInspected: Record<string, { by: string; when: string }>
  initialError?: string
}) {
  const [submitError, setSubmitError] = useState(
    initialError ? (SUBMIT_ERROR_MESSAGES[initialError] ?? SUBMIT_ERROR_MESSAGES["submit-failed"]) : null
  )
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({
    date: today,
  })
  const [duplicateWarningSerial, setDuplicateWarningSerial] = useState<string | null>(null)
  // Set when someone picks a shift that doesn't match the actual clock —
  // e.g. it's 9am and they pick Night. Real mixups like this are how
  // Date/Shift ends up disagreeing with the actual submission timestamp
  // (see the CSV export's "Submitted At" column). Only checked against
  // "today" — a deliberately backdated entry for a past date isn't a
  // mistake, so it skips this check entirely.
  const [shiftMismatchPick, setShiftMismatchPick] = useState<string | null>(null)

  // Offer to resume an autosaved draft instead of silently overwriting it —
  // `pendingDraft` gates the autosave effect below until the user picks
  // Resume or Start Over, so landing on a stale draft doesn't immediately
  // clobber it with the fresh blank state.
  const [loadedDraft, setLoadedDraft] = useState<InspectionDraft | null>(null)
  const [draftChecked, setDraftChecked] = useState(false)

  // A lazy useState initializer would avoid the effect entirely, but this
  // component is server-rendered too (it's "use client", not client-only),
  // and localStorage doesn't exist during that pass — reading it has to
  // stay in an effect so the deterministic SSR output always matches the
  // client's first render, and the draft check only lands in a later,
  // separate commit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadedDraft(loadInspectionDraft())
    setDraftChecked(true)
  }, [])

  const pendingDraft = loadedDraft && isDraftMeaningful(loadedDraft) ? loadedDraft : null

  const steps: StepDef[] =
    values.inspectionType === "Repair Request"
      ? [
          { kind: "date" },
          { kind: "name" },
          { kind: "inspectionType" },
          { kind: "shift" },
          { kind: "equipment" },
          { kind: "locationCheck" },
          { kind: "repairDetails" },
        ]
      : [
          { kind: "date" },
          { kind: "name" },
          { kind: "inspectionType" },
          { kind: "shift" },
          { kind: "equipment" },
          { kind: "locationCheck" },
          ...questions.map((q) => ({ kind: "question" as const, question: q })),
        ]
  const [photoPreviews, setPhotoPreviews] = useState<
    Record<string, (string | null)[]>
  >({})

  // Skipped while a draft is awaiting Resume/Start Over so the fresh blank
  // state doesn't overwrite the very draft being offered.
  useEffect(() => {
    if (!draftChecked || pendingDraft) return
    saveInspectionDraft({ values, step, savedAt: new Date().toISOString() })
  }, [values, step, draftChecked, pendingDraft])

  function resumeDraft() {
    if (!pendingDraft) return
    setValues(pendingDraft.values)
    setStep(pendingDraft.step)
    setLoadedDraft(null)
  }

  function discardDraft() {
    clearInspectionDraft()
    setLoadedDraft(null)
  }

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

  // Only checked against "today" — someone deliberately backdating an entry
  // for a past date isn't making a mistake, so that skips the check.
  function pickShift(name: string) {
    if (values.date === today && name !== getShiftForDate(new Date())) {
      setShiftMismatchPick(name)
      return
    }
    setShiftMismatchPick(null)
    selectAndAdvance("shift", name)
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
    if (s.kind === "repairDetails") {
      const hasDescription = Boolean(values.repairDescription?.trim())
      const hasPhoto = (photoPreviews[REPAIR_REQUEST_ISSUE_ID] ?? []).some(
        (p) => p !== null
      )
      return hasDescription && hasPhoto
    }
    if (s.kind === "shift") return Boolean(values.shift)
    if (s.kind === "equipment") return Boolean(values.equipmentSerial)
    if (s.kind === "locationCheck") {
      if (values.locationMatches === "Yes") return true
      if (values.locationMatches === "No") return Boolean(values.actualLocation)
      return false
    }
    const v = values[s.question.id]
    if (!v) return false
    // A flagged item with no documentation defeats the point of flagging it —
    // photos stay optional, but a note is required, same principle as the
    // Repair Request flow already requiring at least one photo. One rule for
    // every bad answer including "Other" — there used to be a separate
    // "Please Specify" field just for Other, but that meant two boxes doing
    // the same job, and whichever one someone didn't happen to fill in
    // silently blocked them with no obvious reason why.
    if (needsAttention(v) && !values[`${s.question.id}_note`]?.trim()) return false
    return true
  }

  const canAdvance = stepIsAnswered(current)
  const currentAnswer = current.kind === "question" ? values[current.question.id] : undefined
  const currentQuestionId = current.kind === "question" ? current.question.id : undefined
  // Shows red the moment a bad answer makes Note required, not only after a
  // failed Continue tap — otherwise the required field looks just like an
  // optional one until someone gets blocked with no idea why.
  const noteMissing =
    current.kind === "question" &&
    Boolean(currentAnswer) &&
    needsAttention(currentAnswer ?? "") &&
    !values[`${currentQuestionId}_note`]?.trim()
  const showContinue =
    !isLast &&
    (current.kind === "date" ||
      current.kind === "name" ||
      (current.kind === "locationCheck" && values.locationMatches === "No") ||
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

  const firstNameInputRef = useRef<HTMLInputElement>(null)

  // Each equipment pick (category → forklift type → color/make → FL#)
  // reveals the next section right below it — on a small phone that new
  // section routinely lands below the fold, so tapping the answer that was
  // right in front of you can leave the next question invisible until you
  // notice you need to scroll. Following each pick down fixes that the same
  // way the Note textarea below needs to follow the keyboard up.
  const equipmentTypeSectionRef = useRef<HTMLDivElement>(null)
  const equipmentColorSectionRef = useRef<HTMLDivElement>(null)
  const equipmentFlSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (values.equipmentCategory) {
      // "start" (not "nearest") so the whole new section — not just its
      // top edge — has the best chance of landing inside what's left of
      // the screen below the sticky header, since "nearest" is satisfied
      // the instant any sliver of the section is visible, which was
      // leaving the actual buttons still below the fold.
      equipmentTypeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [values.equipmentCategory])

  useEffect(() => {
    if (values.equipmentType) {
      equipmentColorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [values.equipmentType])

  useEffect(() => {
    if (values.equipmentMakeColor) {
      equipmentFlSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }, [values.equipmentMakeColor])

  // Same idea for any text field — a focused input hidden behind the
  // on-screen keyboard is what someone filling in the Note field (or any
  // other text box) was running into. Delegated to one focus handler on the
  // whole step area (via React's bubbling synthetic events) rather than
  // wiring an onFocus onto every individual input/textarea in this form.
  // The delay lets iOS finish animating the keyboard open first — scrolling
  // immediately fights that animation and loses.
  function handleContentFocus(e: ReactFocusEvent<HTMLDivElement>) {
    const target = e.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    if (target.type === "date" || target.type === "hidden" || target.type === "file") return
    setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 300)
  }
  // A double-tap on the left side of the current question steps back, same
  // as tapping "← Back" — swiping was the first attempt at this, but a
  // horizontal drag on a real phone runs straight into Mobile Safari's own
  // edge-swipe "go back in browser history" gesture, which a web page
  // cannot reliably suppress — that's what was sending someone all the way
  // back to the Home page instead of one question back. A tap sequence
  // doesn't compete with that system gesture at all.
  const contentRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const DOUBLE_TAP_MS = 400
  const DOUBLE_TAP_MOVE_PX = 60

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const container = el

    function onClick(e: MouseEvent) {
      if (step === 0) return
      // Only counts on empty space (padding, headings, gaps) — a tap that
      // actually hits a button/label/input just does that control's own
      // job, twice, same as any other double-click on a real control would.
      const target = e.target as HTMLElement
      if (target.closest("button, a, label, input, textarea, select, [data-swipe-ignore]")) return

      const rect = container.getBoundingClientRect()
      if (e.clientX - rect.left >= rect.width / 2) return // right side — ignore

      const now = Date.now()
      const last = lastTapRef.current
      if (
        last &&
        now - last.time < DOUBLE_TAP_MS &&
        Math.abs(e.clientX - last.x) < DOUBLE_TAP_MOVE_PX &&
        Math.abs(e.clientY - last.y) < DOUBLE_TAP_MOVE_PX
      ) {
        lastTapRef.current = null
        handleBack()
        return
      }
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY }
    }

    el.addEventListener("click", onClick)
    return () => el.removeEventListener("click", onClick)
  }, [step])

  const errorBanner = submitError && (
    <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
      <span className="flex-1">{submitError}</span>
      <button
        type="button"
        onClick={() => setSubmitError(null)}
        aria-label="Dismiss"
        className="shrink-0 text-lg leading-none text-red-400 active:scale-90"
      >
        ×
      </button>
    </div>
  )

  if (pendingDraft) {
    const savedAtLabel = new Date(pendingDraft.savedAt).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        {errorBanner}
        <div className="text-4xl">📝</div>
        <h1 className="mt-4 text-lg font-bold text-gray-900">
          Resume your unfinished inspection?
        </h1>
        <p className="mt-2 max-w-xs text-sm text-gray-500">
          {/* A space right after a {`{jsxExpression}`} on the same line as
              more text gets silently dropped by JSX's own whitespace
              trimming (each text run between expressions/elements is
              trimmed per-line before rendering) — explicit {`{" "}`}
              expressions on both sides of <strong> avoid that. */}
          Saved <strong className="font-semibold text-gray-700">{savedAtLabel}</strong> ·{" "}
          <span className="font-semibold text-amber-600">Not submitted yet.</span>
          <br />
          <strong className="font-semibold text-gray-700">
            Any photos will need to be re-attached.
          </strong>
        </p>
        <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
          <button
            type="button"
            onClick={resumeDraft}
            className="rounded-lg bg-brand px-6 py-3 font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={discardDraft}
            className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-600 transition-transform duration-100 active:scale-95 active:bg-gray-50"
          >
            Start Over
          </button>
        </div>
      </div>
    )
  }

  return (
    <form action={submitInspection} className="flex flex-1 flex-col">
      {errorBanner}
      <div className="sticky top-0 z-10 bg-white px-4 pt-4 pb-2">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>
            {step + 1} / {total}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-brand transition-all duration-200"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-gray-500">
          You&apos;re the first to notice. Thank you for checking.
        </p>
        {showGreeting && (
          <p className="mt-1.5 text-sm font-semibold text-brand">
            {timeOfDayIcon(new Date())} Hello, {values.firstName}!
          </p>
        )}
      </div>

      <div ref={contentRef} className="flex-1 px-4 pt-6 pb-6" onFocus={handleContentFocus}>
        {/* Date */}
        <div hidden={current.kind !== "date"}>
          <StepHeading text="Inspection Date" />
          <p className="mb-5 text-sm text-gray-500">
            Let&apos;s get started — it only takes a couple of minutes.
          </p>
          {/* The real <input type="date"> sits directly on top of the
              formatted label (an invisible, exact-size overlay) so a tap
              lands on the actual native control — not a separate button
              calling `showPicker()`. showPicker() looked fine in every
              test but turned out unreliable on a real phone, the same
              "works in testing, not on iOS" gap this app already hit once
              with a custom swipe gesture. See formatDateLabel above for
              why the label itself is still custom-formatted. */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="block w-full max-w-full min-w-0 rounded-lg border border-gray-300 px-4 py-3 text-left text-base text-gray-900"
            >
              {formatDateLabel(values.date ?? "")}
            </div>
            <input
              type="date"
              name="date"
              value={values.date ?? ""}
              onChange={(e) => set("date", e.target.value)}
              required
              aria-label="Inspection date"
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
          </div>
        </div>

        {/* Name (last + first, one step, two sections) */}
        <div hidden={current.kind !== "name"}>
          <StepHeading text="Your Name" />
          <div className="space-y-5">
            <div>
              <label htmlFor="lastName" className="mb-1.5 block text-sm font-medium text-gray-700">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                name="lastName"
                value={values.lastName ?? ""}
                onChange={(e) => set("lastName", e.target.value)}
                required
                autoFocus={current.kind === "name"}
                // enterKeyHint swaps the mobile keyboard's return key to
                // say "Next" instead of the default "Go"/"Return" — the
                // onKeyDown is what actually moves focus when it's tapped
                // (the on-screen "Next"/→ key still dispatches a plain
                // Enter keydown, same as a hardware keyboard's Enter).
                // preventDefault so it advances focus instead of trying to
                // submit the whole multi-step form early.
                enterKeyHint="next"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  e.preventDefault()
                  firstNameInputRef.current?.focus()
                }}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
              />
            </div>
            <div>
              <label htmlFor="firstName" className="mb-1.5 block text-sm font-medium text-gray-700">
                First Name
              </label>
              <input
                ref={firstNameInputRef}
                id="firstName"
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
            {INSPECTION_TYPES.map(({ value, label }) => {
              const isChecked = values.inspectionType === value
              return (
                <label
                  key={value}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-transform duration-100 active:scale-95 ${
                    isChecked ? "border-brand bg-brand/10" : "border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="inspectionType"
                    value={value}
                    checked={isChecked}
                    onChange={() => selectAndAdvance("inspectionType", value)}
                    onClick={() => {
                      if (isChecked) selectAndAdvance("inspectionType", value)
                    }}
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
                  <span className="text-base text-gray-800">{label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Repair Request details */}
        <div hidden={current.kind !== "repairDetails"}>
          <StepHeading text="Describe the Problem" />
          <p className="mb-5 text-sm text-gray-500">
            A manager will be notified to review this equipment right away.
          </p>
          <div className="space-y-4">
            <div>
              <label htmlFor="repairDescription" className="mb-1.5 block text-sm font-medium text-gray-700">
                What&apos;s wrong?
              </label>
              <textarea
                id="repairDescription"
                name="repairDescription"
                value={values.repairDescription ?? ""}
                onChange={(e) => set("repairDescription", e.target.value)}
                rows={3}
                placeholder="Describe the problem in as much detail as possible"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Photos{" "}
                <span className="font-normal text-gray-400">
                  (at least 1 required)
                </span>
              </label>
              <div className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: REPAIR_REQUEST_PHOTO_SLOTS }, (_, i) => (
                  <PhotoSlot
                    key={i}
                    number={i + 1}
                    name={`repairRequest_photo_${i}`}
                    preview={photoPreviews[REPAIR_REQUEST_ISSUE_ID]?.[i] ?? null}
                    onChange={(file) =>
                      setPhotoPreview(REPAIR_REQUEST_ISSUE_ID, i, file)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
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
                      ? "border-brand bg-brand/10"
                      : "border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="shift"
                    value={s.name}
                    checked={isChecked}
                    onChange={() => pickShift(s.name)}
                    onClick={() => {
                      if (isChecked) pickShift(s.name)
                    }}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isChecked
                        ? "border-brand bg-brand"
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

          {shiftMismatchPick && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                ⚠ Current time is <strong>{formatEasternTime(new Date())}</strong> — that&apos;s{" "}
                {getShiftForDate(new Date())} shift right now. Submit this as{" "}
                <strong>{shiftMismatchPick}</strong> shift anyway?
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShiftMismatchPick(null)}
                  className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 active:scale-95"
                >
                  Pick the Other Shift
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shift = shiftMismatchPick
                    setShiftMismatchPick(null)
                    selectAndAdvance("shift", shift)
                  }}
                  className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white active:scale-95"
                >
                  Continue Anyway
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Equipment */}
        <div hidden={current.kind !== "equipment"}>
          <StepHeading text="Which equipment are you inspecting?" />

          <p className="mb-2 text-sm font-medium text-gray-700">
            Please select the type of the equipment
          </p>
          <div className="grid grid-cols-2 gap-2">
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
                  className={`flex flex-col items-center gap-2 rounded-lg border p-2 transition-transform duration-100 active:scale-95 ${
                    isChecked
                      ? "border-brand bg-brand/10"
                      : "border-gray-300"
                  }`}
                >
                  <NextImage
                    src={cat === "Pallet Jack" ? EQUIPMENT_IMAGES["Pallet Jack"] : EQUIPMENT_IMAGES["Sit Down"]}
                    alt={cat}
                    width={160}
                    height={110}
                    className="h-20 w-full rounded object-contain"
                  />
                  <span
                    className={`text-base ${isChecked ? "font-semibold text-brand" : "text-gray-800"}`}
                  >
                    {cat}
                  </span>
                </button>
              )
            })}
          </div>

          {values.equipmentCategory === "Forklift" && (
            <div ref={equipmentTypeSectionRef} className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">
                Select forklift type
              </p>
              <div className="grid grid-cols-3 gap-2">
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
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-transform duration-100 active:scale-95 ${
                        isChecked
                          ? "border-brand bg-brand/10"
                          : "border-gray-300"
                      }`}
                    >
                      <NextImage
                        src={EQUIPMENT_IMAGES[type]}
                        alt={equipmentTypeLabel(type)}
                        width={140}
                        height={100}
                        className="h-16 w-full rounded object-contain"
                      />
                      <span
                        className={`text-xs ${isChecked ? "font-semibold text-brand" : "text-gray-800"}`}
                      >
                        {equipmentTypeLabel(type)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {values.equipmentType && (
            <div ref={equipmentColorSectionRef} className="mt-4">
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
                              ? "border-brand bg-brand/10 font-semibold text-brand"
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
            <div ref={equipmentFlSectionRef} className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                FL#
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
                          onClick={() => {
                            if (recentlyInspected[eq.serial]) {
                              setDuplicateWarningSerial(eq.serial)
                            } else {
                              selectAndAdvance("equipmentSerial", eq.serial)
                            }
                          }}
                          className={`flex flex-col items-center rounded-lg border px-2 py-3 transition-transform duration-100 active:scale-95 ${
                            isChecked
                              ? "border-brand bg-brand/10"
                              : "border-gray-300"
                          }`}
                        >
                          <span
                            className={`text-lg font-semibold ${
                              isChecked ? "text-brand" : "text-gray-900"
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

              {duplicateWarningSerial && recentlyInspected[duplicateWarningSerial] && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <p className="text-sm text-amber-800">
                    ⚠ It&apos;s been inspected by{" "}
                    <strong>{recentlyInspected[duplicateWarningSerial].by}</strong> for{" "}
                    {recentlyInspected[duplicateWarningSerial].when}. Submit another
                    inspection anyway?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDuplicateWarningSerial(null)}
                      className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-semibold text-gray-700 active:scale-95"
                    >
                      Choose a Different Vehicle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        selectAndAdvance("equipmentSerial", duplicateWarningSerial)
                        setDuplicateWarningSerial(null)
                      }}
                      className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white active:scale-95"
                    >
                      Continue Anyway
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <input type="hidden" name="equipmentSerial" value={values.equipmentSerial ?? ""} />
        </div>

        {/* Location check */}
        <div hidden={current.kind !== "locationCheck"}>
          {(() => {
            const expectedLocation = equipmentList.find(
              (eq) => eq.serial === values.equipmentSerial
            )?.location

            return (
              <>
                <StepHeading
                  text={
                    expectedLocation ? (
                      <>
                        Is the equipment at{" "}
                        <span className="underline">{expectedLocation}</span>?
                      </>
                    ) : (
                      "Is the equipment where it's supposed to be?"
                    )
                  }
                />
                <div className="flex flex-col gap-5">
                  {(["Yes", "No"] as const).map((opt) => {
                    const isChecked = values.locationMatches === opt
                    return (
                      <label
                        key={opt}
                        className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-transform duration-100 active:scale-95 ${
                          isChecked ? "border-brand bg-brand/10" : "border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="locationMatches"
                          value={opt}
                          checked={isChecked}
                          onChange={() => {
                            set("locationMatches", opt)
                            set("actualLocation", "")
                            if (opt === "Yes") advance()
                          }}
                          onClick={() => {
                            if (isChecked && opt === "Yes") advance()
                          }}
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

                {values.locationMatches === "No" && (
                  <div className="mt-8">
                    <p className="mb-3 text-base font-semibold text-gray-900">
                      Where is it actually?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {LOCATIONS.filter((loc) => loc !== expectedLocation).map((loc) => {
                        const isChecked = values.actualLocation === loc
                        return (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => set("actualLocation", loc)}
                            className={`rounded-lg border px-3 py-3 text-sm transition-transform duration-100 active:scale-95 ${
                              isChecked
                                ? "border-brand bg-brand/10 font-semibold text-brand"
                                : "border-gray-300 text-gray-800"
                            }`}
                          >
                            {loc}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          <input type="hidden" name="actualLocation" value={values.actualLocation ?? ""} />
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
                        ? "border-brand bg-brand/10"
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
                      onClick={() => {
                        if (isChecked && !needsAttention(opt)) advance()
                      }}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        isChecked
                          ? "border-brand bg-brand"
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
            {Boolean(values[q.id]) && needsAttention(values[q.id]) && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Photos
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {Array.from({ length: CHECKLIST_PHOTO_SLOTS }, (_, i) => (
                      <PhotoSlot
                        key={i}
                        number={i + 1}
                        name={`${q.id}_photo_${i}`}
                        preview={photoPreviews[q.id]?.[i] ?? null}
                        onChange={(file) => setPhotoPreview(q.id, i, file)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`${q.id}_note`}
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Note
                  </label>
                  <textarea
                    id={`${q.id}_note`}
                    name={`${q.id}_note`}
                    rows={3}
                    placeholder="Describe in as much detail as possible"
                    value={values[`${q.id}_note`] ?? ""}
                    onChange={(e) => set(`${q.id}_note`, e.target.value)}
                    className={`w-full rounded-lg border px-4 py-3 text-base ${
                      noteMissing && q.id === currentQuestionId
                        ? "border-red-400 placeholder:text-red-800"
                        : "border-gray-300"
                    }`}
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
              className="shrink-0 px-1 py-3 text-sm font-medium text-brand opacity-70 transition-transform duration-100 active:scale-95 active:opacity-100"
            >
              ← Back
            </button>
          )}
          {isLast ? (
            <SubmitButton blocked={!canAdvance} />
          ) : (
            showContinue && (
              <button
                type="button"
                onClick={handleNext}
                aria-disabled={!canAdvance}
                className={`flex-1 rounded-lg px-4 py-4 text-lg font-semibold text-white transition-transform duration-100 active:scale-95 ${
                  canAdvance
                    ? "bg-brand active:bg-brand-dark"
                    : "cursor-not-allowed bg-gray-300 active:scale-100"
                }`}
              >
                Continue
              </button>
            )
          )}
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

function StepHeading({ text }: { text: React.ReactNode }) {
  return <h2 className="mb-6 text-xl font-bold text-gray-900">{text}</h2>
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

function CropIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  )
}

// One upload slot: handles picking a file, converting HEIC to JPEG so it's
// actually viewable, offering a remove (X) button, and an optional crop.
// Whatever the final file ends up being gets written onto the underlying
// <input> itself (via setInputFiles) so the native form submission picks
// up the processed version rather than the raw picked file.
// Every photo upload in the app (checklist answers and Repair Request
// alike) goes through this one slot, so crop/highlight/undo-redo behave
// identically everywhere rather than varying by section. Each slot shows
// its own number (1-4) at all times, not just once a photo's attached —
// that's how someone points at a specific photo from the one shared Note
// field ("see photo 2") instead of needing a caption on every photo.
function PhotoSlot({
  number,
  name,
  preview,
  onChange,
}: {
  number: number
  name: string
  preview: string | null
  onChange: (file: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  // A freshly-picked photo is staged here and the editor opens on it right
  // away — nothing is committed (onChange/setInputFiles) until Save, so
  // there's no separate "upload, then remember to go edit it" step.
  const [pendingSrc, setPendingSrc] = useState<string | null>(null)

  async function handleFile(raw: File | null) {
    if (!raw) return
    let working = raw
    if (isHeicFile(raw)) {
      setBusy(true)
      try {
        working = await convertHeicToJpeg(raw)
      } catch {
        working = raw
      } finally {
        setBusy(false)
      }
    }
    setPendingSrc(URL.createObjectURL(working))
    setEditing(true)
  }

  function handleRemove(e: React.MouseEvent) {
    e.preventDefault()
    setInputFiles(inputRef.current, null)
    onChange(null)
  }

  function handleEditApply(file: File) {
    setInputFiles(inputRef.current, file)
    onChange(file)
    setEditing(false)
    setPendingSrc(null)
  }

  function handleEditCancel() {
    // Only a fresh, not-yet-committed pick needs the native input cleared —
    // canceling a re-edit of an already-saved photo must leave it alone.
    if (pendingSrc && inputRef.current) inputRef.current.value = ""
    setEditing(false)
    setPendingSrc(null)
  }

  const editorSrc = pendingSrc ?? preview

  return (
    <div className="relative aspect-square">
      <label className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-gray-300 bg-gray-50">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
          name={name}
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
        {busy ? (
          <span className="px-1 text-center text-[10px] text-gray-400">
            Converting…
          </span>
        ) : preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <CameraIcon className="h-6 w-6 text-gray-400" />
        )}
      </label>

      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1 left-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
          preview ? "bg-black/60 text-white" : "bg-gray-200 text-gray-500"
        }`}
      >
        {number}
      </span>

      {preview && !busy && (
        <>
          <button
            type="button"
            onClick={handleRemove}
            aria-label="Remove photo"
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white shadow transition-transform duration-100 active:scale-90"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-3 w-3"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit photo"
            className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-100 active:scale-90"
          >
            <CropIcon className="h-3 w-3" />
          </button>
        </>
      )}

      {editing && editorSrc && (
        <PhotoEditorModal src={editorSrc} onCancel={handleEditCancel} onApply={handleEditApply} />
      )}
    </div>
  )
}
// Keeps the photo fully covering the crop viewport — panning/zooming can
// never reveal empty space around it (which would export as solid black,
// since JPEG has no transparency to fall back on).
function clampPanOffset(
  offset: { x: number; y: number },
  scale: number,
  natural: { w: number; h: number },
  viewport: number
): { x: number; y: number } {
  const maxX = Math.max(0, (natural.w * scale - viewport) / 2)
  const maxY = Math.max(0, (natural.h * scale - viewport) / 2)
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  }
}

const HIGHLIGHT_COLORS = {
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
} as const

type EditSnapshot = {
  scale: number
  offset: { x: number; y: number }
  drawingDataUrl: string | null
}

const EDIT_HISTORY_LIMIT = 10

function loadDataUrlIntoCanvas(canvas: HTMLCanvasElement, dataUrl: string) {
  const img = new Image()
  img.onload = () => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
  }
  img.src = dataUrl
}

// Crop (pan/zoom) and the highlight pen live on the same screen, toggled by
// two small icons over the image, rather than separate tabs — and every
// completed gesture (a pan, a zoom, a stroke, a clear) is one undo step,
// capped at 10 like a normal editor's history.
function PhotoEditorModal({
  src,
  onCancel,
  onApply,
}: {
  src: string
  onCancel: () => void
  onApply: (file: File) => void
}) {
  const VIEWPORT = 280
  const imgRef = useRef<HTMLImageElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)
  const [tool, setTool] = useState<"crop" | "pen">("crop")
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [penColor, setPenColor] = useState<keyof typeof HIGHLIGHT_COLORS | "eraser">(
    "red"
  )
  const [history, setHistory] = useState<{ stack: EditSnapshot[]; index: number }>({
    stack: [],
    index: -1,
  })
  const scaleRef = useRef(scale)
  const offsetRef = useRef(offset)
  const dragRef = useRef<{
    x: number
    y: number
    offset: { x: number; y: number }
  } | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  function pushHistory(entry: EditSnapshot) {
    setHistory(({ stack, index }) => {
      let next = [...stack.slice(0, index + 1), entry]
      let nextIndex = next.length - 1
      if (next.length > EDIT_HISTORY_LIMIT) {
        const overflow = next.length - EDIT_HISTORY_LIMIT
        next = next.slice(overflow)
        nextIndex -= overflow
      }
      return { stack: next, index: nextIndex }
    })
  }

  function currentSnapshot(): EditSnapshot {
    return {
      scale: scaleRef.current,
      offset: offsetRef.current,
      drawingDataUrl: drawCanvasRef.current?.toDataURL() ?? null,
    }
  }

  function restoreSnapshot(entry: EditSnapshot) {
    scaleRef.current = entry.scale
    offsetRef.current = entry.offset
    setScale(entry.scale)
    setOffset(entry.offset)
    const canvas = drawCanvasRef.current
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
      if (entry.drawingDataUrl) loadDataUrlIntoCanvas(canvas, entry.drawingDataUrl)
    }
  }

  function undo() {
    setHistory(({ stack, index }) => {
      if (index <= 0) return { stack, index }
      restoreSnapshot(stack[index - 1])
      return { stack, index: index - 1 }
    })
  }
  function redo() {
    setHistory(({ stack, index }) => {
      if (index >= stack.length - 1) return { stack, index }
      restoreSnapshot(stack[index + 1])
      return { stack, index: index + 1 }
    })
  }

  function handleImgLoad() {
    const img = imgRef.current
    if (!img) return
    const w = img.naturalWidth
    const h = img.naturalHeight
    const fit = Math.max(VIEWPORT / w, VIEWPORT / h)
    setNatural({ w, h })
    setScale(fit)
    setOffset({ x: 0, y: 0 })
    scaleRef.current = fit
    offsetRef.current = { x: 0, y: 0 }
    setHistory({ stack: [{ scale: fit, offset: { x: 0, y: 0 }, drawingDataUrl: null }], index: 0 })
  }

  function handleCropPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { x: e.clientX, y: e.clientY, offset }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function handleCropPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !natural) return
    const raw = {
      x: dragRef.current.offset.x + (e.clientX - dragRef.current.x),
      y: dragRef.current.offset.y + (e.clientY - dragRef.current.y),
    }
    const next = clampPanOffset(raw, scale, natural, VIEWPORT)
    offsetRef.current = next
    setOffset(next)
  }
  function handleCropPointerUp() {
    if (dragRef.current) pushHistory(currentSnapshot())
    dragRef.current = null
  }

  function handleScaleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = Number(e.target.value)
    scaleRef.current = next
    setScale(next)
    if (natural) {
      const clamped = clampPanOffset(offsetRef.current, next, natural, VIEWPORT)
      offsetRef.current = clamped
      setOffset(clamped)
    }
  }

  function canvasPoint(e: React.PointerEvent<HTMLDivElement>) {
    const rect = drawCanvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  function handleDrawPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawingRef.current = true
    lastPointRef.current = canvasPoint(e)
  }
  function handleDrawPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawingRef.current) return
    const ctx = drawCanvasRef.current?.getContext("2d")
    const from = lastPointRef.current
    if (!ctx || !from) return
    const to = canvasPoint(e)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    if (penColor === "eraser") {
      ctx.globalCompositeOperation = "destination-out"
      ctx.lineWidth = 18
    } else {
      ctx.globalCompositeOperation = "source-over"
      ctx.strokeStyle = HIGHLIGHT_COLORS[penColor]
      ctx.lineWidth = 6
    }
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    lastPointRef.current = to
  }
  function handleDrawPointerUp() {
    if (drawingRef.current) pushHistory(currentSnapshot())
    drawingRef.current = false
    lastPointRef.current = null
  }

  function handleClearDrawing() {
    const canvas = drawCanvasRef.current
    const ctx = canvas?.getContext("2d")
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height)
    pushHistory({ ...currentSnapshot(), drawingDataUrl: null })
  }

  function handleApply() {
    const img = imgRef.current
    if (!img || !natural) return
    const OUTPUT = 640
    const outputScale = OUTPUT / VIEWPORT
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const drawW = natural.w * scale * outputScale
    const drawH = natural.h * scale * outputScale
    const drawX = OUTPUT / 2 - drawW / 2 + offset.x * outputScale
    const drawY = OUTPUT / 2 - drawH / 2 + offset.y * outputScale
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    if (drawCanvasRef.current) {
      ctx.drawImage(drawCanvasRef.current, 0, 0, VIEWPORT, VIEWPORT, 0, 0, OUTPUT, OUTPUT)
    }
    canvas.toBlob(
      (blob) => {
        if (blob) onApply(new File([blob], "photo.jpg", { type: "image/jpeg" }))
      },
      "image/jpeg",
      0.9
    )
  }

  const minScale = natural ? Math.max(VIEWPORT / natural.w, VIEWPORT / natural.h) : 1
  const canUndo = history.index > 0
  const canRedo = history.index < history.stack.length - 1
  const overlayButton =
    "flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white transition-transform duration-100 active:scale-90 disabled:opacity-30"

  return (
    <div data-swipe-ignore className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xs rounded-lg bg-white p-4">
        <div
          // Drawing with the pen tool is a long, deliberate finger-drag right
          // on top of an <img>/<canvas> — exactly what iOS reads as "select
          // this content" and answers with the blue selection highlight +
          // Copy/Look Up callout. touch-none alone (touch-action) stops the
          // browser from panning/zooming here, but doesn't stop that
          // selection callout, which needs these two properties explicitly.
          className="relative mx-auto touch-none [-webkit-touch-callout:none] [-webkit-user-select:none] select-none overflow-hidden rounded-lg bg-gray-100"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={tool === "crop" ? handleCropPointerDown : handleDrawPointerDown}
          onPointerMove={tool === "crop" ? handleCropPointerMove : handleDrawPointerMove}
          onPointerUp={tool === "crop" ? handleCropPointerUp : handleDrawPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={handleImgLoad}
            draggable={false}
            className={`absolute left-1/2 top-1/2 max-w-none select-none transition-opacity duration-150 ${
              natural ? "opacity-100" : "opacity-0"
            }`}
            style={{
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            }}
          />
          <canvas
            ref={drawCanvasRef}
            width={VIEWPORT}
            height={VIEWPORT}
            className="absolute inset-0"
          />

          <div className="absolute left-1.5 top-1.5 flex gap-1">
            <button
              type="button"
              onClick={undo}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!canUndo}
              aria-label="Undo"
              className={overlayButton}
            >
              <UndoIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={redo}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!canRedo}
              aria-label="Redo"
              className={overlayButton}
            >
              <RedoIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="absolute right-1.5 top-1.5 flex gap-1">
            <button
              type="button"
              onClick={() => setTool("crop")}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Crop"
              className={`${overlayButton} ${tool === "crop" ? "bg-brand" : ""}`}
            >
              <CropIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setTool("pen")}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Pen"
              className={`${overlayButton} ${tool === "pen" ? "bg-brand" : ""}`}
            >
              <PenIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {tool === "crop" ? (
          <input
            type="range"
            min={minScale}
            max={minScale * 3}
            step={(minScale * 2) / 100}
            value={scale}
            onChange={handleScaleChange}
            onPointerUp={() => pushHistory(currentSnapshot())}
            className="mt-3 w-full"
          />
        ) : (
          <div className="mt-3 flex items-center gap-2">
            {(Object.keys(HIGHLIGHT_COLORS) as (keyof typeof HIGHLIGHT_COLORS)[]).map(
              (c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPenColor(c)}
                  aria-label={`${c} pen`}
                  className={`h-7 w-7 rounded-full border-2 transition-transform duration-100 active:scale-90 ${
                    penColor === c ? "border-gray-800" : "border-transparent"
                  }`}
                  style={{ backgroundColor: HIGHLIGHT_COLORS[c] }}
                />
              )
            )}
            <button
              type="button"
              onClick={() => setPenColor("eraser")}
              aria-label="Eraser"
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-gray-600 transition-transform duration-100 active:scale-90 ${
                penColor === "eraser" ? "border-gray-800 bg-gray-100" : "border-gray-300"
              }`}
            >
              <EraserIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleClearDrawing}
              className="ml-auto text-xs font-medium text-gray-500 underline"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 transition-transform duration-100 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function EraserIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 20H8.5L3 14.5a1 1 0 0 1 0-1.4l8.6-8.6a1 1 0 0 1 1.4 0l7 7a1 1 0 0 1 0 1.4L13.5 20" />
      <path d="M8 12.5 15.5 20" />
    </svg>
  )
}

function PenIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M17 3a2.83 2.83 0 0 1 4 4L7 21l-4 1 1-4Z" />
      <path d="m14.5 5.5 4 4" />
    </svg>
  )
}

function UndoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

function RedoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  )
}
