export type Shift = {
  name: string
  startHour: number // 0-23, Eastern local time, inclusive
  endHour: number // 0-23, Eastern local time, exclusive (wraps past midnight if <= startHour)
}

// Only two shifts actually exist — Day and Night. The fleet is in Holland,
// MI, so shift boundaries are always evaluated in Eastern time regardless of
// where this server happens to run.
export const SHIFTS: Shift[] = [
  { name: "Day", startHour: 5, endHour: 17 },
  { name: "Night", startHour: 17, endHour: 5 },
]

export const FLEET_TIME_ZONE = "America/Detroit"

function easternOffsetMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  )
  return (asUtc - date.getTime()) / 60000
}

// Converts an Eastern-time wall-clock moment to the real UTC instant it
// refers to, correcting for whatever DST offset applies on that date. A
// single correction pass can land on the wrong side of a DST transition
// (the offset at the initial guess differs from the offset at the actual
// target instant), so this re-checks the offset at the corrected instant
// and adjusts again — two passes always converges for a jump this small.
function easternWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number
): Date {
  const target = Date.UTC(year, month - 1, day, hour)
  let instant = new Date(target)
  for (let i = 0; i < 2; i++) {
    instant = new Date(target - easternOffsetMinutes(instant) * 60000)
  }
  return instant
}

function easternDateParts(date: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour") % 24 }
}

export function getShiftForDate(date: Date): string {
  const { hour } = easternDateParts(date)
  for (const shift of SHIFTS) {
    if (shift.startHour < shift.endHour) {
      if (hour >= shift.startHour && hour < shift.endHour) return shift.name
    } else if (hour >= shift.startHour || hour < shift.endHour) {
      return shift.name
    }
  }
  return "Unknown"
}

export type ShiftWindow = { label: string; start: Date; end: Date }

// The shift currently in progress, as a real [start, end) instant range —
// used to check whether a given inspection's timestamp falls inside it.
export function getCurrentShiftWindow(now: Date): ShiftWindow {
  const { year, month, day, hour } = easternDateParts(now)
  const isDay = hour >= 5 && hour < 17

  let startYear = year
  let startMonth = month
  let startDay = day
  if (!isDay && hour < 5) {
    // Early-morning tail of the Night shift that began the previous
    // Eastern calendar day at 17:00.
    const prevDay = new Date(Date.UTC(year, month - 1, day - 1))
    startYear = prevDay.getUTCFullYear()
    startMonth = prevDay.getUTCMonth() + 1
    startDay = prevDay.getUTCDate()
  }

  const startHour = isDay ? 5 : 17
  const start = easternWallClockToUtc(startYear, startMonth, startDay, startHour)
  const end = new Date(start.getTime() + 12 * 60 * 60 * 1000)
  return { label: isDay ? "Day" : "Night", start, end }
}

// The most recent occurrence of each shift — whichever one is currently in
// progress, plus whichever one most recently ended. Shifts run back-to-back
// with no gaps, so the other shift's last window is simply the 12 hours
// immediately before the current one started.
export function getMostRecentShiftWindows(now: Date): { Day: ShiftWindow; Night: ShiftWindow } {
  const current = getCurrentShiftWindow(now)
  const previous: ShiftWindow = {
    label: current.label === "Day" ? "Night" : "Day",
    start: new Date(current.start.getTime() - 12 * 60 * 60 * 1000),
    end: current.start,
  }
  return current.label === "Day" ? { Day: current, Night: previous } : { Day: previous, Night: current }
}

// The Eastern-calendar-date key (YYYY-MM-DD) a given instant falls on —
// used to seed a date picker's default value and to step it by whole days.
export function easternDateKey(date: Date): string {
  const { year, month, day } = easternDateParts(date)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

// Plain calendar-date arithmetic on a YYYY-MM-DD key — not a timezone
// conversion, just walking the key forward/back by whole days.
export function shiftDateKeyByDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

// The Monday (Eastern-calendar) of the Mon-Sun week containing dateKey —
// used to anchor the dashboard's weekly report to a fixed week grid
// regardless of which day it's viewed on.
export function mondayOfWeek(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = dt.getUTCDay() // 0 = Sun .. 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  dt.setUTCDate(dt.getUTCDate() + diff)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`
}

// Where an export's date range should start, as the same "YYYY-MM-DD"
// business-day key used everywhere else. "This Week"/"This Month" are
// real calendar boundaries (Monday / the 1st), not just "the last 7/30
// days" — returns null for "all" (caller falls back to the retention
// cutoff) and for an invalid/missing custom date.
export function exportRangeStart(
  range: "all" | "week" | "month" | "custom",
  todayKey: string,
  customFrom: string | null
): string | null {
  if (range === "week") return mondayOfWeek(todayKey)
  if (range === "month") return `${todayKey.slice(0, 7)}-01`
  if (range === "custom") {
    return customFrom && /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? customFrom : null
  }
  return null
}

// The named shift for a specific Eastern calendar date — used when a
// supervisor navigates to a past date instead of "whatever's most recent."
export function getShiftWindowForDate(dateKey: string, label: "Day" | "Night"): ShiftWindow {
  const [year, month, day] = dateKey.split("-").map(Number)
  const startHour = label === "Day" ? 5 : 17
  const start = easternWallClockToUtc(year, month, day, startHour)
  const end = new Date(start.getTime() + 12 * 60 * 60 * 1000)
  return { label, start, end }
}
