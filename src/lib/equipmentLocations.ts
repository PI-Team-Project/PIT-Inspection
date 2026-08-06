import { prisma } from "./prisma"
import { EQUIPMENT_LIST, LOCATIONS, type Equipment, type Location } from "./equipment"

function isValidLocation(value: string): value is Location {
  return (LOCATIONS as readonly string[]).includes(value)
}

// Server-only: merges the EquipmentLocation overrides table on top of the
// static fleet list's default locations, and drops any serial a manager has
// archived. Equipment.ts stays importable from client components, so the DB
// lookups live here instead.
export async function getEquipmentListWithCurrentLocations(): Promise<Equipment[]> {
  const [overrides, archived] = await Promise.all([
    prisma.equipmentLocation.findMany(),
    prisma.equipmentArchived.findMany({ select: { serial: true } }),
  ])

  const archivedSerials = new Set(archived.map((a) => a.serial))
  const active = EQUIPMENT_LIST.filter((eq) => !archivedSerials.has(eq.serial))
  if (overrides.length === 0) return active

  const overrideBySerial = new Map(overrides.map((o) => [o.serial, o.location]))
  return active.map((eq) => {
    const override = overrideBySerial.get(eq.serial)
    return override && isValidLocation(override) ? { ...eq, location: override } : eq
  })
}
