import { prisma } from "./prisma"
import { deletePhotoObjects } from "./photoStorage"
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
  // Storage objects removed alongside the rows — zero on a dry run.
  deletedPhotoObjects: number
}

// Deleting an Inspection cascades its Photo rows, but object storage knows
// nothing about foreign keys — without this the bucket would keep every
// photo whose row retention already removed, growing forever behind a
// table that does not. Objects go first: an orphaned object costs storage
// and can be swept again later, whereas deleting the rows first would lose
// the only record of which keys to remove.
async function purgePhotoObjects(where: object): Promise<number> {
  const photos = await prisma.photo.findMany({
    where: { inspection: where, storagePath: { not: null } },
    select: { storagePath: true },
  })
  if (photos.length === 0) return 0
  return deletePhotoObjects(photos.map((p) => p.storagePath as string))
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
  let deletedPhotoObjects = 0

  for (const type of Object.keys(RETENTION_YEARS) as EquipmentType[]) {
    const cutoff = cutoffFor(type, now)
    cutoffs[type] = cutoff.toISOString().slice(0, 10)
    const serials = serialsByType.get(type) ?? []
    if (serials.length === 0) {
      deletedByType[type] = 0
      continue
    }
    const where = { equipmentSerial: { in: serials }, createdAt: { lt: cutoff } }
    if (dryRun) {
      deletedByType[type] = await prisma.inspection.count({ where })
    } else {
      deletedPhotoObjects += await purgePhotoObjects(where)
      deletedByType[type] = (await prisma.inspection.deleteMany({ where })).count
    }
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
  let deletedOrphaned: number
  if (dryRun) {
    deletedOrphaned = await prisma.inspection.count({ where: orphanWhere })
  } else {
    deletedPhotoObjects += await purgePhotoObjects(orphanWhere)
    deletedOrphaned = (await prisma.inspection.deleteMany({ where: orphanWhere })).count
  }

  const totalDeletedInspections =
    Object.values(deletedByType).reduce((a, b) => a + b, 0) + deletedOrphaned

  return {
    dryRun,
    cutoffs,
    deletedByType,
    deletedOrphaned,
    totalDeletedInspections,
    deletedPhotoObjects,
  }
}
