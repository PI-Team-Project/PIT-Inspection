export type Shift = {
  name: string
  startHour: number // 0-23, local time, inclusive
  endHour: number // 0-23, local time, exclusive (wraps past midnight if <= startHour)
}

// Only two shifts actually exist — Day and Night.
export const SHIFTS: Shift[] = [
  { name: "Day", startHour: 6, endHour: 18 },
  { name: "Night", startHour: 18, endHour: 6 },
]

export function getShiftForDate(date: Date): string {
  const hour = date.getHours()
  for (const shift of SHIFTS) {
    if (shift.startHour < shift.endHour) {
      if (hour >= shift.startHour && hour < shift.endHour) return shift.name
    } else if (hour >= shift.startHour || hour < shift.endHour) {
      return shift.name
    }
  }
  return "Unknown"
}
