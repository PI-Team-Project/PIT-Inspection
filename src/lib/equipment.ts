export type ForkliftType = "Sit Down" | "Standup" | "Propane"
export type EquipmentType = ForkliftType | "Pallet Jack"
export type EquipmentCategory = "Forklift" | "Pallet Jack"

// The official location names — everywhere a location is stored, shown, or
// picked from must use exactly one of these.
export const LOCATIONS = [
  "WH",
  "MI1",
  "MI2 Assembly",
  "MI2 Electrode",
  "MI2 Formation",
  "MI3",
  "MI4 Pack",
  "MI4 Toyota",
  "Waverly",
  "Repairing 🛠️",
] as const
export type Location = (typeof LOCATIONS)[number]

export const REPAIR_LOCATION: Location = "Repairing 🛠️"
export function isUnderRepair(location: string): boolean {
  return location === REPAIR_LOCATION
}

// Every vehicle migrated from the old hardcoded EQUIPMENT_LIST got the same
// backfill-script timestamp as its createdAt — not a real "added" date, so
// there's nothing meaningful to show for those. Only vehicles added through
// the Manage Vehicles page after this exact moment have a real one. Lives
// here (not equipmentLocations.ts) so client components can import it
// without pulling in that module's server-only Prisma dependency.
export const EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT = new Date("2026-08-12T18:21:13.345Z")

export type Equipment = {
  type: EquipmentType
  flNumber: string
  serial: string
  makeColor: string
  contractType: "Rent" | "Leasing" | "Own"
  location: Location
}

export function equipmentCategory(type: EquipmentType): EquipmentCategory {
  return type === "Pallet Jack" ? "Pallet Jack" : "Forklift"
}

// "Standup" is the stored/compared type value everywhere (URLs, filters,
// EQUIPMENT_LIST) — this is only for what a person actually reads.
export function equipmentTypeLabel(type: EquipmentType): string {
  return type === "Standup" ? "Stand Up" : type
}

// Sourced from the forklift fleet list (NO 1-27; excludes rows with no NO#,
// which were marked "Picked up" and are no longer in service) and the pallet
// jack fleet list (NO 1-7; excludes NO 8-10, marked "Returned" with no FL#
// or ownership type on file, and already dropped from that list's own count).
// `location` is each list's "Current Loc. (as of 6/16)" column.
export const EQUIPMENT_LIST: Equipment[] = [
  { type: "Sit Down", flNumber: "R-MIT-0348", serial: "A4BC150348", makeColor: "Red Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Sit Down", flNumber: "R-MIT-0352", serial: "A4BC150352", makeColor: "Red Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Sit Down", flNumber: "M-MIT-0599", serial: "AFB30B50599", makeColor: "Mint Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Sit Down", flNumber: "M-MIT-0498", serial: "AFB2600498", makeColor: "Mint Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Sit Down", flNumber: "R-MIT-0204", serial: "AFB3050204", makeColor: "Red Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Sit Down", flNumber: "M-MIT-0270", serial: "EFB2600270", makeColor: "Mint Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Sit Down", flNumber: "M-MIT-0271", serial: "EFB2600271", makeColor: "Mint Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Sit Down", flNumber: "R-MIT-0351", serial: "A4BC150351", makeColor: "Red Mitsubishi", contractType: "Rent", location: "WH" },
  { type: "Propane", flNumber: "P-DOO-7108", serial: "FGA14-1290-07108", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI1" },
  { type: "Propane", flNumber: "P-DOO-7630", serial: "FGA14-1290-07630", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI2 Electrode" },
  { type: "Standup", flNumber: "S-DOO-0116", serial: "FBA42-3440-00116", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI2 Electrode" },
  { type: "Standup", flNumber: "S-DOO-0136", serial: "FBA42-3440-00136", makeColor: "Orange Doosan", contractType: "Leasing", location: "Waverly" },
  { type: "Propane", flNumber: "P-DOO-7685", serial: "FGA14-1290-07685", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI2 Electrode" },
  { type: "Standup", flNumber: "S-DOO-0084", serial: "FBA42-3440-00084", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI2 Electrode" },
  { type: "Standup", flNumber: "S-DOO-0137", serial: "FBA42-3440-00137", makeColor: "Orange Doosan", contractType: "Leasing", location: "Waverly" },
  { type: "Standup", flNumber: "S-DOO-0082", serial: "FBA42-3440-00082", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI2 Formation" },
  { type: "Standup", flNumber: "S-DOO-0125", serial: "FBA42-3440-00125", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI2 Formation" },
  { type: "Standup", flNumber: "S-DOO-0083", serial: "FBA42-3440-00083", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI2 Formation" },
  { type: "Sit Down", flNumber: "R-MIT-0349", serial: "A4BC150349", makeColor: "Red Mitsubishi", contractType: "Rent", location: "MI3" },
  { type: "Standup", flNumber: "S-DOO-0122", serial: "FBA42-3440-00122", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI3" },
  { type: "Sit Down", flNumber: "DOO-0885", serial: "FBA1B-1360-00885", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI4 Toyota" },
  { type: "Sit Down", flNumber: "DOO-0884", serial: "FBA1B-1360-00884", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI3" },
  { type: "Sit Down", flNumber: "DOO-0887", serial: "FBA1B-1360-00887", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI4 Toyota" },
  { type: "Sit Down", flNumber: "DOO-0889", serial: "FBA1B-1360-00889", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI4 Toyota" },
  { type: "Standup", flNumber: "S-DOO-0134", serial: "FBA42-3440-00134", makeColor: "Orange Doosan", contractType: "Leasing", location: "MI4 Toyota" },
  { type: "Standup", flNumber: "S-DOO-0124", serial: "FBA42-3440-00124", makeColor: "Orange Doosan", contractType: "Leasing", location: "Repairing 🛠️" },
  { type: "Standup", flNumber: "S-DOO-0126", serial: "FBA42-3440-00126", makeColor: "Orange Doosan", contractType: "Leasing", location: "Waverly" },
  { type: "Pallet Jack", flNumber: "BigJ-4317", serial: "4341804317", makeColor: "Big Joe", contractType: "Own", location: "MI2 Electrode" },
  { type: "Pallet Jack", flNumber: "BigJ-1650", serial: "4341801650", makeColor: "Big Joe", contractType: "Own", location: "MI2 Electrode" },
  { type: "Pallet Jack", flNumber: "BigJ-3449", serial: "4341503449", makeColor: "Big Joe", contractType: "Own", location: "MI1" },
  { type: "Pallet Jack", flNumber: "BigJ-3424", serial: "4341503424", makeColor: "Big Joe", contractType: "Own", location: "MI4 Pack" },
  { type: "Pallet Jack", flNumber: "BigJ-4314", serial: "4341504314", makeColor: "Big Joe", contractType: "Own", location: "MI4 Pack" },
  { type: "Pallet Jack", flNumber: "MIT-2302", serial: "98502302", makeColor: "Mint Mitsubishi", contractType: "Own", location: "MI4 Pack" },
  { type: "Pallet Jack", flNumber: "MIT-2304", serial: "98502304", makeColor: "Mint Mitsubishi", contractType: "Own", location: "MI4 Pack" },
]
