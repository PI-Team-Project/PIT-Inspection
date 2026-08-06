import { prisma } from "./prisma"
import { EQUIPMENT_LIST, LOCATIONS, type Equipment, type Location } from "./equipment"

function isValidLocation(value: string): value is Location {
  return (LOCATIONS as readonly string[]).includes(value)
}

// Server-only: merges the EquipmentLocation overrides table on top of the
// static fleet list's default locations. Equipment.ts stays importable from
// client components, so the DB lookup lives here instead.
export async function getEquipmentListWithCurrentLocations(): Promise<Equipment[]> {
  const overrides = await prisma.equipmentLocation.findMany()
  if (overrides.length === 0) return EQUIPMENT_LIST

  const overrideBySerial = new Map(overrides.map((o) => [o.serial, o.location]))
  return EQUIPMENT_LIST.map((eq) => {
    const override = overrideBySerial.get(eq.serial)
    return override && isValidLocation(override) ? { ...eq, location: override } : eq
  })
}
