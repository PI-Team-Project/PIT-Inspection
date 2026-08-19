import { prisma } from "./prisma"
import { RETENTION_YEARS } from "@/app/dashboard/inspectionRow"
import type { EquipmentType } from "./equipment"

// The dashboard/export queries only ever *filter out* old rows — nothing
// has ever deleted them, so the Inspection/Photo tables grow forever even
// though the UI treats data past RETENTION_YEARS as gone. This is the
// actual enforcement: per-equipment-type cutoff (forklifts kept 2 years,
// pallet jacks 5), deleting Inspection rows past it. Photo rows cascade
// automatically (see the Photo model's onDelete: Cascade).
export type RetentionResult = {
  dryRun: boolean
  cutoffs: Record<EquipmentType, string>
  deletedByType: Record<string, number>
  deletedOrphaned: number
  totalDeletedInspections: number
}

function cutoffFor(type: EquipmentType, now: Date): Date {
  const cutoff = new Date(now)
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS[type])
  return cutoff
}

export async function runRetentionCleanup({
  dryRun,
  now = new Date(),
}: {
  dryRun: boolean
  now?: Date
}): Promise<RetentionResult> {
  const equipment = await prisma.equipment.findMany({ select: { serial: true, type: true } })
  const serialsByType = new Map<EquipmentType, string[]>()
  for (const eq of equipment) {
    const type = eq.type as EquipmentType
    const list = serialsByType.get(type)
    if (list) list.push(eq.serial)
    else serialsByType.set(type, [eq.serial])
  }
  const knownSerials = new Set(equipment.map((e) => e.serial))

  const cutoffs = {} as Record<EquipmentType, string>
  const deletedByType: Record<string, number> = {}

  for (const type of Object.keys(RETENTION_YEARS) as EquipmentType[]) {
    const cutoff = cutoffFor(type, now)
    cutoffs[type] = cutoff.toISOString().slice(0, 10)
    const serials = serialsByType.get(type) ?? []
    if (serials.length === 0) {
      deletedByType[type] = 0
      continue
    }
    const where = { equipmentSerial: { in: serials }, createdAt: { lt: cutoff } }
    deletedByType[type] = dryRun
      ? await prisma.inspection.count({ where })
      : (await prisma.inspection.deleteMany({ where })).count
  }

  // Inspections whose equipmentSerial no longer matches any current
  // Equipment row (typo'd serial, or the vehicle record itself was somehow
  // removed rather than soft-retired) — use the longest retention window
  // as the safe default rather than guessing, so ambiguous data outlives
  // any single type's cutoff.
  const longestCutoff = cutoffFor(
    (Object.entries(RETENTION_YEARS).sort((a, b) => b[1] - a[1])[0][0]) as EquipmentType,
    now
  )
  const orphanWhere = {
    equipmentSerial: { notIn: [...knownSerials] },
    createdAt: { lt: longestCutoff },
  }
  const deletedOrphaned = dryRun
    ? await prisma.inspection.count({ where: orphanWhere })
    : (await prisma.inspection.deleteMany({ where: orphanWhere })).count

  const totalDeletedInspections =
    Object.values(deletedByType).reduce((a, b) => a + b, 0) + deletedOrphaned

  return { dryRun, cutoffs, deletedByType, deletedOrphaned, totalDeletedInspections }
}
