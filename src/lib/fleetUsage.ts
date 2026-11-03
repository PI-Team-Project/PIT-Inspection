import { getShiftWindowForDate, mondayOfWeek, shiftDateKeyByDays } from "./shifts"

// How much of the fleet is actually used. There is no usage log — a vehicle
// counts as "used" in a shift when it has an inspection in that shift's
// window, since every vehicle is inspected before it is driven. A shift is
// the same 5am/5pm Eastern window the dashboard and Weekly Report use, so
// these numbers agree with the coverage chart there.

export type UsageRange = "week" | "2w" | "4w" | "3m"

export const USAGE_RANGES: { key: UsageRange; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "2w", label: "2 Weeks" },
  { key: "4w", label: "4 Weeks" },
  { key: "3m", label: "3 Months" },
]

export function parseUsageRange(value: string | undefined): UsageRange {
  return value === "week" || value === "2w" || value === "3m" ? value : "4w"
}

// First calendar date of the range. `dataStartKey` (the first inspection
// ever kept) clamps it, so days before any data existed don't count as
// days the fleet sat idle.
export function usageRangeStart(range: UsageRange, todayKey: string, dataStartKey: string | null): string {
  const daysBack = { "2w": -13, "4w": -27, "3m": -89 } as const
  const start = range === "week" ? mondayOfWeek(todayKey) : shiftDateKeyByDays(todayKey, daysBack[range])
  return dataStartKey && dataStartKey > start ? dataStartKey : start
}

export type UsageShift = { dateKey: string; label: "Day" | "Night"; start: Date; end: Date }

// Every shift from startKey through todayKey that has already ENDED. The
// one in progress is left out: half a shift would read as low usage.
export function completedShifts(startKey: string, todayKey: string, now: Date): UsageShift[] {
  const shifts: UsageShift[] = []
  for (let key = startKey; key <= todayKey; key = shiftDateKeyByDays(key, 1)) {
    for (const label of ["Day", "Night"] as const) {
      const { start, end } = getShiftWindowForDate(key, label)
      if (end.getTime() <= now.getTime()) shifts.push({ dateKey: key, label, start, end })
    }
  }
  return shifts
}

export type UsageVehicle = {
  serial: string
  flNumber: string
  type: string
  location: string
  // Eastern date the vehicle joined the fleet; shifts before it don't count
  // against it.
  addedKey: string
}

export type VehicleUsage = UsageVehicle & {
  shiftsUsed: number
  shiftsInFleet: number
  rate: number // 0-1
}

export type GroupUsage = {
  label: string
  vehicles: number
  avgUsed: number
  rate: number
  // Most of the group's vehicles used in any one shift — the group's real
  // requirement; `vehicles - peak` were spare even at the busiest shift.
  peak: number
}

export type ShiftUsage = { dateKey: string; label: "Day" | "Night"; used: number; fleet: number }

export type FleetUsage = {
  shiftCount: number
  fleetSize: number
  avgUsed: number
  avgRate: number
  peak: ShiftUsage | null
  low: ShiftUsage | null
  vehicles: VehicleUsage[]
  byType: GroupUsage[]
  byLocation: GroupUsage[]
  // [Mon..Sun][Day, Night] — average vehicles used, null when the range
  // has no completed shift on that weekday/shift.
  weekdayGrid: { day: (number | null)[]; night: (number | null)[] }
  perShift: ShiftUsage[]
}

// Weekday index 0 = Monday … 6 = Sunday for a YYYY-MM-DD key.
function weekdayIndex(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

export function computeFleetUsage(
  shifts: UsageShift[],
  vehicles: UsageVehicle[],
  inspections: { equipmentSerial: string; createdAt: Date }[],
  groupOrder: { types: readonly string[]; locations: readonly string[] }
): FleetUsage {
  // Serials seen in each shift. Shifts are back-to-back 12h windows, so
  // each inspection lands in at most one; a binary search finds it.
  const usedIn = shifts.map(() => new Set<string>())
  for (const { equipmentSerial, createdAt } of inspections) {
    const t = createdAt.getTime()
    let lo = 0
    let hi = shifts.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (t < shifts[mid].start.getTime()) hi = mid - 1
      else if (t >= shifts[mid].end.getTime()) lo = mid + 1
      else {
        usedIn[mid].add(equipmentSerial)
        break
      }
    }
  }

  const perShift: ShiftUsage[] = shifts.map((shift, i) => {
    const inFleet = vehicles.filter((v) => v.addedKey <= shift.dateKey)
    return {
      dateKey: shift.dateKey,
      label: shift.label,
      used: inFleet.filter((v) => usedIn[i].has(v.serial)).length,
      fleet: inFleet.length,
    }
  })

  const vehicleUsage: VehicleUsage[] = vehicles
    .map((v) => {
      let shiftsUsed = 0
      let shiftsInFleet = 0
      shifts.forEach((shift, i) => {
        if (v.addedKey > shift.dateKey) return
        shiftsInFleet++
        if (usedIn[i].has(v.serial)) shiftsUsed++
      })
      return { ...v, shiftsUsed, shiftsInFleet, rate: shiftsInFleet ? shiftsUsed / shiftsInFleet : 0 }
    })
    .sort(
      (a, b) =>
        b.rate - a.rate ||
        b.shiftsUsed - a.shiftsUsed ||
        a.flNumber.localeCompare(b.flNumber, undefined, { numeric: true })
    )

  const totalUsed = perShift.reduce((sum, s) => sum + s.used, 0)
  const totalFleet = perShift.reduce((sum, s) => sum + s.fleet, 0)
  const pick = (better: (a: ShiftUsage, b: ShiftUsage) => boolean) =>
    perShift.reduce<ShiftUsage | null>((best, s) => (best === null || better(s, best) ? s : best), null)

  // A group's rate is the share of its vehicle-shifts that were used —
  // the same ratio as each vehicle's own rate, pooled.
  function group(labels: readonly string[], keyOf: (v: VehicleUsage) => string): GroupUsage[] {
    return labels
      .map((label) => {
        const members = vehicleUsage.filter((v) => keyOf(v) === label)
        const used = members.reduce((sum, v) => sum + v.shiftsUsed, 0)
        const inFleet = members.reduce((sum, v) => sum + v.shiftsInFleet, 0)
        const peak = usedIn.reduce(
          (max, serials) => Math.max(max, members.filter((v) => serials.has(v.serial)).length),
          0
        )
        return {
          label,
          vehicles: members.length,
          avgUsed: shifts.length ? used / shifts.length : 0,
          rate: inFleet ? used / inFleet : 0,
          peak,
        }
      })
      .filter((g) => g.vehicles > 0)
  }

  const sums = Array.from({ length: 7 }, () => ({ day: [0, 0], night: [0, 0] }))
  perShift.forEach((s) => {
    const cell = sums[weekdayIndex(s.dateKey)][s.label === "Day" ? "day" : "night"]
    cell[0] += s.used
    cell[1] += 1
  })
  const avg = ([total, count]: number[]) => (count ? total / count : null)

  return {
    shiftCount: shifts.length,
    fleetSize: vehicles.length,
    avgUsed: shifts.length ? totalUsed / shifts.length : 0,
    avgRate: totalFleet ? totalUsed / totalFleet : 0,
    peak: pick((a, b) => a.used > b.used),
    low: pick((a, b) => a.used < b.used),
    vehicles: vehicleUsage,
    byType: group(groupOrder.types, (v) => v.type),
    byLocation: group(groupOrder.locations, (v) => v.location),
    weekdayGrid: {
      day: sums.map((s) => avg(s.day)),
      night: sums.map((s) => avg(s.night)),
    },
    perShift,
  }
}
