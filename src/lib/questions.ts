export type Question = {
  id: string
  number: number
  label: string
  shortLabel?: string
  options: string[]
  note?: string
}

// Single source of truth for the checklist portion of the inspection.
// Edit this list to change the form — no database migration needed, answers are stored as JSON.
export const QUESTIONS: Question[] = [
  {
    id: "tires",
    number: 1,
    label: "Tires",
    options: ["Good", "Poor", "Other (Specify)"],
  },
  {
    id: "fluidBattery",
    number: 2,
    label: "Fluid Levels/Battery",
    shortLabel: "Fluid Low",
    note: "If water is needed, only fill AFTER a fully charged battery.",
    options: ["Good", "Needs to be watered", "Other (Specify)"],
  },
  {
    id: "batteryPlug",
    number: 3,
    label: "Battery Plug",
    options: ["Good (No Exposed Wire)", "Poor", "Other (Specify)"],
  },
  {
    id: "batteryIndicator",
    number: 4,
    label: "Battery Indicator",
    shortLabel: "Battery",
    options: ["Good", "Damaged", "Other (Specify)"],
  },
  {
    id: "fluidLeaks",
    number: 5,
    label: "Any Fluid Leaks",
    shortLabel: "Leakage",
    options: ["No", "Yes", "Other (Specify)"],
  },
  {
    id: "bodyCondition",
    number: 6,
    label: "Body Condition",
    shortLabel: "Body Damage",
    options: ["Good", "Poor", "Other (Specify)"],
  },
  {
    id: "horn",
    number: 7,
    label: "Horn",
    options: ["Good", "Poor", "Other (Specify)"],
  },
  {
    id: "forwardBackward",
    number: 8,
    label: "Forward & Backward Movement",
    shortLabel: "Movement",
    options: ["Working condition", "Not working condition", "Other (Specify)"],
  },
  {
    id: "liftLowering",
    number: 9,
    label: "Lift/Lowering Movement",
    shortLabel: "Lift/Lower",
    options: ["Working condition", "Not working condition", "Other (Specify)"],
  },
]

export const QUESTIONS_BY_ID: Record<string, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q])
)

// A Repair Request has no checklist — it's a single free-form issue that's
// always critical. This pseudo-question lets it flow through the same
// flagged/review machinery as a checklist answer, keyed by a reserved id
// that can never collide with a real checklist question's id.
export const REPAIR_REQUEST_ISSUE_ID = "repairRequest"

export const REPAIR_REQUEST_QUESTION: Question = {
  id: REPAIR_REQUEST_ISSUE_ID,
  number: 0,
  label: "Repair Request",
  options: [],
}

// These conditions make the vehicle unsafe to operate outright — flagging
// any of them escalates a Daily inspection straight to the same Unresolved
// (red) severity as a Repair Request, instead of the usual Attention
// (amber) tier every other checklist question gets.
export const SAFETY_CRITICAL_QUESTION_IDS: readonly string[] = [
  "horn",
  "fluidLeaks",
  "forwardBackward",
  "liftLowering",
]

export function isSafetyCriticalQuestion(id: string): boolean {
  return SAFETY_CRITICAL_QUESTION_IDS.includes(id)
}

export const REPAIR_REQUEST_PHOTO_SLOTS = 6

export const CHECKLIST_PHOTO_SLOTS = 4

export function needsSpecify(value: string) {
  return value.startsWith("Other")
}

const GOOD_ANSWERS = new Set([
  "Good",
  "Good (No Exposed Wire)",
  "No",
  "Working condition",
])

export function needsAttention(value: string) {
  return !GOOD_ANSWERS.has(value)
}
