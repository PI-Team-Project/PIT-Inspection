export type Question = {
  id: string
  number: number
  label: string
  options: string[]
  note?: string
}

// Single source of truth for the checklist portion of the inspection (items 6-14).
// Edit this list to change the form — no database migration needed, answers are stored as JSON.
export const QUESTIONS: Question[] = [
  {
    id: "tires",
    number: 6,
    label: "Tires",
    options: ["Good", "Poor", "Other (Specify)"],
  },
  {
    id: "fluidBattery",
    number: 7,
    label: "Fluid Levels/Battery",
    note: "If water is needed, only fill AFTER a fully charged battery.",
    options: ["Good", "Needs to be watered", "Other (Specify)"],
  },
  {
    id: "batteryPlug",
    number: 8,
    label: "Battery Plug",
    options: ["Good (No Exposed Wire)", "Poor", "Other (Specify)"],
  },
  {
    id: "batteryIndicator",
    number: 9,
    label: "Battery Indicator",
    options: ["Good", "Damaged", "Other (Specify)"],
  },
  {
    id: "fluidLeaks",
    number: 10,
    label: "Any Fluid Leaks",
    options: ["No", "Yes", "Other (Specify)"],
  },
  {
    id: "bodyCondition",
    number: 11,
    label: "Body Condition",
    options: ["Good", "Poor", "Other (Specify)"],
  },
  {
    id: "horn",
    number: 12,
    label: "Horn",
    options: ["Good", "Poor", "Other (Specify)"],
  },
  {
    id: "forwardBackward",
    number: 13,
    label: "Forward & Backward Movement",
    options: ["Working condition", "Not working condition", "Other (Specify)"],
  },
  {
    id: "liftLowering",
    number: 14,
    label: "Lift/Lowering Movement",
    options: ["Working condition", "Not working condition", "Other (Specify)"],
  },
]

export const QUESTIONS_BY_ID: Record<string, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q])
)

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
