// One-off synthetic-data generator for load/functional testing — simulates
// ~30 vehicles being inspected twice a day for a month by a rotating pool of
// workers. Points ONLY at the local `prisma dev` test database (hardcoded
// below), never at .env's DATABASE_URL, so there's no way this can touch
// the real (production-shared) database regardless of what .env contains.
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { EQUIPMENT_LIST } from "../src/lib/equipment"
import { QUESTIONS, SAFETY_CRITICAL_QUESTION_IDS } from "../src/lib/questions"
import { getShiftWindowForDate } from "../src/lib/shifts"

const TEST_DB_URL = "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable"
const pool = new Pool({ connectionString: TEST_DB_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const DAYS = 30
const INSPECTORS = [
  "Jamie Lee",
  "Marcus Diaz",
  "Aisha Bello",
  "Tyler Brooks",
  "Priya Nair",
  "Sam Farrow",
  "Devon Park",
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomTimeIn(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

type Answer = { value: string; note?: string }

function dailyAnswers(flagId: string | null): Record<string, Answer> {
  const answers: Record<string, Answer> = {}
  for (const q of QUESTIONS) {
    if (q.id === flagId) {
      answers[q.id] = { value: q.options[1], note: "Synthetic load-test flag" }
    } else if (Math.random() < 0.02) {
      // A little incidental noise so not every clean day is identical.
      answers[q.id] = { value: q.options[1] }
    } else {
      answers[q.id] = { value: q.options[0] }
    }
  }
  return answers
}

async function main() {
  console.log(`Seeding ${EQUIPMENT_LIST.length} vehicles...`)
  await prisma.equipment.createMany({ data: EQUIPMENT_LIST, skipDuplicates: true })

  const today = new Date()
  const rows: {
    createdAt: Date
    type: string
    date: string
    shift: string
    firstName: string
    lastName: string
    equipmentLabel: string
    equipmentSerial: string
    answers: Record<string, Answer>
    review?: object
  }[] = []

  for (const eq of EQUIPMENT_LIST) {
    for (let d = DAYS - 1; d >= 0; d--) {
      const day = new Date(today)
      day.setUTCDate(day.getUTCDate() - d)
      const dateKey = day.toISOString().slice(0, 10)

      for (const shift of ["Day", "Night"] as const) {
        // Real fleets miss a shift here and there — a busy floor, a vehicle
        // parked all shift, someone forgetting. ~10% gap rate.
        if (Math.random() < 0.1) continue

        const inspector = pick(INSPECTORS)
        const [firstName, lastName] = inspector.split(" ")
        const window = getShiftWindowForDate(dateKey, shift)
        const createdAt = randomTimeIn(window.start, window.end)
        const roll = Math.random()

        let type = "Daily"
        let answers: Record<string, Answer>
        let review: object | undefined

        if (roll < 0.02) {
          type = "Repair Request"
          answers = { repairRequest: { value: "Reported", note: "Synthetic load-test repair request" } }
        } else if (roll < 0.06) {
          answers = dailyAnswers(pick(SAFETY_CRITICAL_QUESTION_IDS))
        } else if (roll < 0.2) {
          const nonCritical = QUESTIONS.filter((q) => !SAFETY_CRITICAL_QUESTION_IDS.includes(q.id))
          const flagId = pick(nonCritical).id
          answers = dailyAnswers(flagId)
          // Half of older non-critical flags have already been reviewed and
          // signed off — real coverage for the "confirmed" (green) stage,
          // not just "pending-confirm" (amber).
          if (d > 3 && Math.random() < 0.5) {
            review = {
              issueStatus: { [flagId]: "complete" },
              activity: [
                {
                  id: `seed-${eq.serial}-${dateKey}-${shift}`,
                  type: "confirmed",
                  authorName: "Supervisor Test",
                  timestamp: new Date(createdAt.getTime() + 60 * 60 * 1000).toISOString(),
                },
              ],
              confirmedResolved: true,
            }
          }
        } else {
          answers = dailyAnswers(null)
        }

        rows.push({
          createdAt,
          type,
          date: dateKey,
          shift,
          firstName,
          lastName,
          equipmentLabel: `${eq.flNumber} — ${eq.makeColor} (${eq.type})`,
          equipmentSerial: eq.serial,
          answers,
          ...(review ? { review } : {}),
        })
      }
    }
  }

  console.log(`Inserting ${rows.length} inspections...`)
  // createMany in chunks — a few thousand rows in one call is fine for
  // Postgres, but chunking keeps memory/latency predictable either way.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.inspection.createMany({ data: rows.slice(i, i + CHUNK) })
    console.log(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}`)
  }

  console.log("Done.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
