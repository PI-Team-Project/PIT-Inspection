import { prisma } from "./prisma"
import type { Equipment, EquipmentType, Location } from "./equipment"

// Server-only: the fleet's master vehicle list lives in the Equipment table
// now (see prisma/schema.prisma), not in a static array — equipment.ts stays
// importable from client components, so the DB lookups live here instead.
function toEquipment(row: {
  serial: string
  type: string
  flNumber: string
  makeColor: string
  contractType: string
  location: string
}): Equipment {
  return {
    serial: row.serial,
    type: row.type as EquipmentType,
    flNumber: row.flNumber,
    makeColor: row.makeColor,
    contractType: row.contractType as Equipment["contractType"],
    location: row.location as Location,
  }
}

export async function getActiveEquipmentList(): Promise<Equipment[]> {
  const rows = await prisma.equipment.findMany({
    where: { retiredAt: null },
    orderBy: { flNumber: "asc" },
  })
  return rows.map(toEquipment)
}

export async function getEquipmentBySerial(serial: string): Promise<Equipment | null> {
  const row = await prisma.equipment.findUnique({ where: { serial } })
  return row ? toEquipment(row) : null
}

// Only the equipment detail page needs this, so it's its own lookup rather
// than widening the shared Equipment type everywhere.
export async function getEquipmentCreatedAt(serial: string): Promise<Date | null> {
  const row = await prisma.equipment.findUnique({ where: { serial }, select: { createdAt: true } })
  return row?.createdAt ?? null
}

export type EquipmentRecord = Equipment & { retiredAt: Date | null; retiredBy: string | null }

// Every vehicle on file, active or retired — the Manage Vehicles page is the
// only place that needs to see retired ones at all.
export async function getAllEquipmentIncludingRetired(): Promise<EquipmentRecord[]> {
  const rows = await prisma.equipment.findMany({ orderBy: { flNumber: "asc" } })
  return rows.map((row) => ({
    ...toEquipment(row),
    retiredAt: row.retiredAt,
    retiredBy: row.retiredBy,
  }))
}

// A retired vehicle's history is kept for 2 years before it's eligible for
// permanent removal.
export const RETENTION_DAYS = 365 * 2

export type ExpiringEquipment = Equipment & { retiredAt: Date; expiresAt: Date }

// Retired vehicles whose 2-year retention window ends within `withinDays` —
// surfaced as a dashboard heads-up so a manager notices before it expires.
export async function getRetiredEquipmentNearingExpiry(
  withinDays: number
): Promise<ExpiringEquipment[]> {
  const rows = await prisma.equipment.findMany({
    where: { retiredAt: { not: null } },
    orderBy: { retiredAt: "asc" },
  })
  const now = Date.now()
  const msPerDay = 24 * 60 * 60 * 1000
  return rows
    .map((row) => {
      const retiredAt = row.retiredAt as Date
      const expiresAt = new Date(retiredAt.getTime() + RETENTION_DAYS * msPerDay)
      return { ...toEquipment(row), retiredAt, expiresAt }
    })
    .filter((eq) => (eq.expiresAt.getTime() - now) / msPerDay <= withinDays)
}
