export type Shift = {
  name: string
  startHour: number // 0-23, local time, inclusive
  endHour: number // 0-23, local time, exclusive (wraps past midnight if <= startHour)
}

// Placeholder boundaries — adjust to match the real shift schedule.
export const SHIFTS: Shift[] = [
  { name: "Day", startHour: 6, endHour: 14 },
  { name: "Evening", startHour: 14, endHour: 22 },
  { name: "Night", startHour: 22, endHour: 6 },
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
