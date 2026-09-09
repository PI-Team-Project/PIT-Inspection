// Synthetic ONE YEAR of realistic operations: ~35 vehicles inspected twice
// a day by a rotating pool of 32 workers, WITH photos on flagged findings —
// the volume/storage question that scripts/seed-loadtest.ts (30 days, no
// photos) can't answer.
//
// Run via `npm run db:staging:seed:year`, which loads DATABASE_URL from
// .env.staging — never from .env, so there is no path by which this touches
// the real (production-shared) database. The localhost assertion below is a
// second, independent guard.
import { randomUUID } from "crypto"
import sharp from "sharp"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { EQUIPMENT_LIST, LOCATIONS } from "../src/lib/equipment"
import { QUESTIONS, SAFETY_CRITICAL_QUESTION_IDS, REPAIR_REQUEST_ISSUE_ID } from "../src/lib/questions"
import { getShiftWindowForDate } from "../src/lib/shifts"

const dbUrl = process.env.DATABASE_URL
if (!dbUrl || !dbUrl.includes("localhost")) {
  console.error(
    "Refusing to run: DATABASE_URL must point at localhost (use `npm run db:staging:seed:year`)."
  )
  process.exit(1)
}

const pool = new Pool({ connectionString: dbUrl })
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })

const DAYS = Number(process.env.SEED_DAYS ?? 365)
// Share of shifts that get skipped entirely — a busy floor, a vehicle parked
// all shift, someone forgetting.
const MISS_RATE = 0.1

// 32 workers, matching "30+ 작업자" — deliberately more than the 7 the
// 30-day loadtest script rotates through, since inspector-name cardinality
// is what the Weekly Report's per-cell tooltip and the export's Inspector
// column actually have to cope with.
const INSPECTORS = [
  "Jamie Lee", "Marcus Diaz", "Aisha Bello", "Tyler Brooks", "Priya Nair",
  "Sam Farrow", "Devon Park", "Rosa Ortiz", "Ken Tanaka", "Bianca Moss",
  "Omar Haddad", "Grace Kim", "Luis Rivera", "Nadia Petrov", "Eli Johnson",
  "Mei Chen", "Andre Dubois", "Hana Sato", "Victor Osei", "Leah Bright",
  "Tomas Novak", "Ruth Adeyemi", "Caleb Stone", "Ingrid Halvorsen",
  "Rafael Souza", "Yuki Mori", "Dana Whitfield", "Pavel Kucera",
  "Simone Laurent", "Josh Vandermeer", "Amara Nwosu", "Trevor Blackwood",
]

const REPAIR_NOTES = [
  "Mast chain slack, needs adjustment", "Hydraulic line weeping at fitting",
  "Seat belt retractor jammed", "Horn intermittent, works when cold",
  "Left rear tire chunked out", "Battery connector housing cracked",
  "Overhead guard bolt sheared", "Forks show heel wear past 10%",
  "Steer axle bushing knocking", "Dash display flickers under load",
]
const FINDING_NOTES = [
  "Photographed for supervisor review", "Reported at shift handover",
  "Marked down, still driveable", "Called in to maintenance",
  "Second shift in a row with this", "Tagged out pending parts",
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
function randomTimeIn(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

type Answer = { value: string; specify?: string; note?: string }

function dailyAnswers(flagId: string | null, note?: string): Record<string, Answer> {
  const answers: Record<string, Answer> = {}
  for (const q of QUESTIONS) {
    if (q.id === flagId) {
      answers[q.id] = { value: q.options[1], ...(note ? { note } : {}) }
    } else if (Math.random() < 0.02) {
      answers[q.id] = { value: q.options[1] }
    } else {
      answers[q.id] = { value: q.options[0] }
    }
  }
  return answers
}

// A pool of distinct, realistically-detailed JPEGs built once and reused.
// Postgres stores every copy in full (no dedup), so reuse keeps generation
// fast without making the storage figures any less honest. Dimensions and
// quality match what actually gets stored: the browser's photo editor
// outputs a 640x640 crop, which the server re-encodes at q72 — its 1600px
// resize is a no-op at that size.
async function buildPhotoPool(count: number): Promise<string[]> {
  const pool: string[] = []
  for (let i = 0; i < count; i++) {
    // Structured noise over a mid-grey ground: compresses like a real grimy
    // warehouse close-up rather than like a flat color swatch, which would
    // understate stored size by an order of magnitude.
    const w = 640, h = 640
    const raw = Buffer.alloc(w * h * 3)
    const baseR = 70 + Math.random() * 60, baseG = 70 + Math.random() * 60, baseB = 75 + Math.random() * 60
    for (let p = 0; p < w * h; p++) {
      const x = p % w, y = (p / w) | 0
      // Low-frequency shading plus high-frequency grain — the two things
      // that set a photo's JPEG cost.
      const shade = Math.sin(x / 45 + i) * 28 + Math.cos(y / 38 - i) * 24
      // Grain amplitude is what sets JPEG cost. Tuned so the pool averages
      // ~70KB stored, which is what the 15 real pre-wipe production photos
      // measured — not cranked to worst-case noise, which ran 108KB and
      // overstated the Photo table by half.
      const grain = (Math.random() - 0.5) * 26
      raw[p * 3]     = Math.max(0, Math.min(255, baseR + shade + grain))
      raw[p * 3 + 1] = Math.max(0, Math.min(255, baseG + shade + grain))
      raw[p * 3 + 2] = Math.max(0, Math.min(255, baseB + shade + grain))
    }
    const jpeg = await sharp(raw, { raw: { width: w, height: h, channels: 3 } })
      .jpeg({ quality: 72 })
      .toBuffer()
    pool.push(`data:image/jpeg;base64,${jpeg.toString("base64")}`)
  }
  return pool
}

async function main() {
  console.log(`Target: ${DAYS} days x ${EQUIPMENT_LIST.length} vehicles x 2 shifts, ${INSPECTORS.length} inspectors\n`)

  console.log("Clearing existing synthetic data...")
  // Photo rows cascade off Inspection (see the Photo model's onDelete).
  await prisma.inspection.deleteMany({})
  await prisma.equipment.updateMany({
    data: { pendingLocation: null, pendingLocationReportedBy: null, pendingLocationReportedAt: null },
  })

  console.log(`Seeding ${EQUIPMENT_LIST.length} vehicles...`)
  await prisma.equipment.createMany({ data: EQUIPMENT_LIST, skipDuplicates: true })

  console.log("Building photo pool...")
  const photoPool = await buildPhotoPool(16)
  const avgKb = photoPool.reduce((s, p) => s + p.length, 0) / photoPool.length / 1024
  console.log(`  16 photos, avg ${avgKb.toFixed(0)}KB stored each\n`)

  const today = new Date()
  type Row = {
    id: string
    createdAt: Date; type: string; date: string; shift: string
    firstName: string; lastName: string; equipmentLabel: string; equipmentSerial: string
    answers: Record<string, Answer>; review?: object
  }
  const rows: Row[] = []
  const photoRows: { inspectionId: string; questionId: string; order: number; dataUri: string }[] = []
  let photoCount = 0

  for (const eq of EQUIPMENT_LIST) {
    for (let d = DAYS - 1; d >= 0; d--) {
      const day = new Date(today)
      day.setUTCDate(day.getUTCDate() - d)
      const dateKey = day.toISOString().slice(0, 10)

      for (const shift of ["Day", "Night"] as const) {
        if (Math.random() < MISS_RATE) continue

        const inspector = pick(INSPECTORS)
        const [firstName, ...rest] = inspector.split(" ")
        const lastName = rest.join(" ")
        const window = getShiftWindowForDate(dateKey, shift)
        const createdAt = randomTimeIn(window.start, window.end)
        const roll = Math.random()

        let type = "Daily"
        let answers: Record<string, Answer>
        let review: object | undefined
        const id = randomUUID()

        const attach = (questionId: string, n: number) => {
          for (let i = 0; i < n; i++) {
            photoRows.push({ inspectionId: id, questionId, order: i, dataUri: pick(photoPool) })
          }
          photoCount += n
        }

        if (roll < 0.02) {
          // Repair Request: always photo-heavy, that's its whole purpose.
          type = "Repair Request"
          answers = { [REPAIR_REQUEST_ISSUE_ID]: { value: "Reported", note: pick(REPAIR_NOTES) } }
          attach(REPAIR_REQUEST_ISSUE_ID, 1 + Math.floor(Math.random() * 3))
        } else if (roll < 0.06) {
          // Safety-critical flag -> unresolved (red) until confirmed.
          const flagId = pick(SAFETY_CRITICAL_QUESTION_IDS)
          answers = dailyAnswers(flagId, pick(FINDING_NOTES))
          if (Math.random() < 0.7) attach(flagId, 1 + Math.floor(Math.random() * 2))
        } else if (roll < 0.2) {
          const nonCritical = QUESTIONS.filter((q) => !SAFETY_CRITICAL_QUESTION_IDS.includes(q.id))
          const flagId = pick(nonCritical).id
          answers = dailyAnswers(flagId, pick(FINDING_NOTES))
          if (Math.random() < 0.5) attach(flagId, 1)
          // Older non-critical flags are mostly reviewed and signed off, so
          // the "confirmed" (green) stage has real coverage too.
          if (d > 3 && Math.random() < 0.6) {
            review = {
              issueStatus: { [flagId]: "complete" },
              confirmedResolved: true,
              activity: [
                {
                  id: `seed-${eq.serial}-${dateKey}-${shift}`,
                  type: "confirmed",
                  authorName: pick(["Supervisor Kim", "Supervisor Reyes", "Supervisor Doyle"]),
                  timestamp: new Date(createdAt.getTime() + 3600_000).toISOString(),
                },
              ],
            }
          }
        } else {
          answers = dailyAnswers(null)
        }

        // Occasional inspector-reported location drift, which is what the
        // "?" badge and the Location Confirmation Needed list feed on.
        if (Math.random() < 0.01) {
          const reported = pick(LOCATIONS.filter((l) => l !== eq.location))
          answers.locationCheck = { value: "No", specify: reported }
        } else {
          answers.locationCheck = { value: "Yes" }
        }

        rows.push({
          id,
          createdAt, type, date: dateKey, shift, firstName, lastName,
          equipmentLabel: `${eq.flNumber} — ${eq.makeColor} (${eq.type})`,
          equipmentSerial: eq.serial,
          answers,
          ...(review ? { review } : {}),
        })
      }
    }
  }

  console.log(`Inserting ${rows.length} inspections + ${photoCount} photos...`)
  // Both tables go in with createMany. Nested photo creates would force one
  // round-trip per photo-bearing inspection — ~2.7k sequential inserts each
  // carrying tens of KB, which took over half an hour. Generating the
  // inspection ids up front lets the photos batch too.
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.inspection.createMany({ data: rows.slice(i, i + CHUNK) })
    if ((i / CHUNK) % 10 === 0) console.log(`  inspections ${Math.min(i + CHUNK, rows.length)}/${rows.length}`)
  }
  // Smaller chunks here: every row carries ~45KB of base64, so 500 at a
  // time would put ~22MB in a single statement.
  const PHOTO_CHUNK = 25
  const photoLimit = Number(process.env.SEED_PHOTO_LIMIT ?? photoRows.length)
  const toInsert = photoRows.slice(0, photoLimit)
  if (toInsert.length < photoRows.length) {
    console.log(`  (capped at ${toInsert.length} of ${photoRows.length} photos via SEED_PHOTO_LIMIT)`)
  }
  for (let i = 0; i < toInsert.length; i += PHOTO_CHUNK) {
    await prisma.photo.createMany({ data: toInsert.slice(i, i + PHOTO_CHUNK) })
    // Breathing room between batches — without it the local server stops
    // answering partway through and the run hangs rather than failing.
    await new Promise((r) => setTimeout(r, 40))
    if ((i / PHOTO_CHUNK) % 20 === 0) console.log(`  photos ${Math.min(i + PHOTO_CHUNK, toInsert.length)}/${toInsert.length}`)
  }

  // A handful of vehicles left mid-approval so the supervisor flow has
  // something waiting on it the moment the dashboard opens.
  const pendingTargets = EQUIPMENT_LIST.slice(0, 3)
  for (const eq of pendingTargets) {
    await prisma.equipment.update({
      where: { serial: eq.serial },
      data: {
        pendingLocation: pick(LOCATIONS.filter((l) => l !== eq.location)),
        pendingLocationReportedBy: pick(INSPECTORS),
        pendingLocationReportedAt: new Date(),
      },
    })
  }

  const inspections = await prisma.inspection.count()
  const photos = await prisma.photo.count()
  console.log(`\nDone. ${inspections} inspections, ${photos} photos, ${pendingTargets.length} pending location approvals.`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
