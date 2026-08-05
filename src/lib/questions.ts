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
