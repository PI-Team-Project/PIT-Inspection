// One-off backfill for Inspection.maybeOpen, safe to re-run.
//
// The column ships defaulting to true, which is correct but slow — every
// row looks like a candidate. This sets the real value using the same
// computeMaybeOpen the write paths use, so the stored flag and the rendered
// stage can't disagree.
//
// Reads in pages and writes only the rows that actually change, so re-runs
// after the first are nearly free.
import { prisma } from "../src/lib/prisma"
import { computeMaybeOpen } from "../src/app/dashboard/inspectionRow"

const PAGE = 2000

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const total = await prisma.inspection.count()
  console.log(`${total.toLocaleString()} inspections${dryRun ? " (dry run)" : ""}`)

  let cursor: string | undefined
  let scanned = 0
  let changed = 0
  const wouldOpen = { true: 0, false: 0 } as Record<string, number>

  for (;;) {
    const page = await prisma.inspection.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, type: true, answers: true, review: true, maybeOpen: true },
    })
    if (page.length === 0) break
    cursor = page[page.length - 1].id
    scanned += page.length

    const toFalse: string[] = []
    const toTrue: string[] = []
    for (const row of page) {
      const should = computeMaybeOpen(row)
      wouldOpen[String(should)]++
      if (should === row.maybeOpen) continue
      ;(should ? toTrue : toFalse).push(row.id)
    }
    changed += toTrue.length + toFalse.length

    if (!dryRun) {
      if (toFalse.length)
        await prisma.inspection.updateMany({ where: { id: { in: toFalse } }, data: { maybeOpen: false } })
      if (toTrue.length)
        await prisma.inspection.updateMany({ where: { id: { in: toTrue } }, data: { maybeOpen: true } })
    }
    console.log(`  ${scanned.toLocaleString()}/${total.toLocaleString()} scanned, ${changed.toLocaleString()} corrected`)
  }

  console.log(`\ndone. open=${wouldOpen.true.toLocaleString()}  closed=${wouldOpen.false.toLocaleString()}`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
