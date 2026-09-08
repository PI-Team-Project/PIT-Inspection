"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { MANAGER_NAME_COOKIE } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { LOCATIONS } from "@/lib/equipment"
import { getShiftWindowForDate } from "@/lib/shifts"

const EQUIPMENT_TYPES = ["Sit Down", "Propane", "Standup", "Pallet Jack"] as const
const CONTRACT_TYPES = ["Rent", "Leasing", "Own"] as const

function isValidType(value: string): boolean {
  return (EQUIPMENT_TYPES as readonly string[]).includes(value)
}
function isValidContractType(value: string): boolean {
  return (CONTRACT_TYPES as readonly string[]).includes(value)
}
function isValidLocation(value: string): boolean {
  return (LOCATIONS as readonly string[]).includes(value)
}

async function rememberManagerName(name: string) {
  const cookieStore = await cookies()
  cookieStore.set(MANAGER_NAME_COOKIE, name, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  })
}

function refreshManagePaths() {
  revalidatePath("/dashboard/manage")
  revalidatePath("/dashboard")
  revalidatePath("/inspection")
}

export type AddVehiclesState = { error: string | null }

export async function addVehicles(
  _prevState: AddVehiclesState,
  formData: FormData
): Promise<AddVehiclesState> {
  const managerName = String(formData.get("managerName") ?? "").trim() || "Unknown"
  const rowCount = Number(formData.get("rowCount") ?? "0")

  const rows: {
    serial: string
    type: string
    flNumber: string
    makeColor: string
    contractType: string
    location: string
    createdAt?: Date
  }[] = []

  for (let i = 0; i < rowCount; i++) {
    const serial = String(formData.get(`serial_${i}`) ?? "").trim()
    if (!serial) continue
    const type = String(formData.get(`type_${i}`) ?? "")
    const flNumber = String(formData.get(`flNumber_${i}`) ?? "").trim()
    const makeColor = String(formData.get(`makeColor_${i}`) ?? "").trim()
    const contractType = String(formData.get(`contractType_${i}`) ?? "")
    const location = String(formData.get(`location_${i}`) ?? "")
    // When this vehicle actually entered the fleet — the table already
    // shows it as "Added <date>", and a vehicle entered into the system a
    // week after it arrived should read as the day it arrived. Blank keeps
    // the schema default (now).
    const addedOn = String(formData.get(`addedOn_${i}`) ?? "").trim()
    const createdAt = /^\d{4}-\d{2}-\d{2}$/.test(addedOn)
      ? getShiftWindowForDate(addedOn, "Day").start
      : undefined

    if (!isValidType(type) || !isValidContractType(contractType) || !isValidLocation(location)) {
      return { error: `Row ${i + 1}: please fill in every field with a valid option.` }
    }
    if (!flNumber || !makeColor) {
      return { error: `Row ${i + 1}: FL# and Make/Color are required.` }
    }
    rows.push({ serial, type, flNumber, makeColor, contractType, location, ...(createdAt ? { createdAt } : {}) })
  }

  if (rows.length === 0) {
    return { error: "Add at least one vehicle with a serial number." }
  }

  const existing = await prisma.equipment.findMany({
    where: { serial: { in: rows.map((r) => r.serial) } },
    select: { serial: true },
  })
  if (existing.length > 0) {
    return { error: `Serial already on file: ${existing.map((e) => e.serial).join(", ")}` }
  }

  await rememberManagerName(managerName)
  await prisma.equipment.createMany({ data: rows })

  refreshManagePaths()
  return { error: null }
}

export type EditVehicleState = { error: string | null }

export async function updateVehicle(
  _prevState: EditVehicleState,
  formData: FormData
): Promise<EditVehicleState> {
  const serial = String(formData.get("serial") ?? "")
  const type = String(formData.get("type") ?? "")
  const flNumber = String(formData.get("flNumber") ?? "").trim()
  const makeColor = String(formData.get("makeColor") ?? "").trim()
  const contractType = String(formData.get("contractType") ?? "")
  const location = String(formData.get("location") ?? "")
  const notes = String(formData.get("notes") ?? "").trim()
  const managerName = String(formData.get("managerName") ?? "").trim() || "Unknown"

  if (!serial) return { error: "Missing serial." }
  if (!isValidType(type) || !isValidContractType(contractType) || !isValidLocation(location)) {
    return { error: "Please fill in every field with a valid option." }
  }
  if (!flNumber || !makeColor) {
    return { error: "FL# and Make/Color are required." }
  }

  await rememberManagerName(managerName)
  await prisma.equipment.update({
    where: { serial },
    data: {
      type,
      flNumber,
      makeColor,
      contractType,
      location,
      notes: notes || null,
      // A supervisor editing the vehicle record directly supersedes any
      // still-unapproved location report, same as the quick-change control.
      pendingLocation: null,
      pendingLocationReportedBy: null,
      pendingLocationReportedAt: null,
    },
  })

  refreshManagePaths()
  return { error: null }
}

// A date the manager typed (YYYY-MM-DD) turned into an instant inside that
// Eastern calendar day, rather than `new Date(dateKey)` — that parses as
// UTC midnight, which is the previous evening in Michigan and would file a
// return under the wrong day for anyone reading it back. 05:00 Eastern is
// the same anchor the shift windows use, so a date shown here and a date
// shown anywhere else in the app agree. Falls back to now when the field is
// blank or malformed, which keeps every existing caller working unchanged.
function retirementInstant(raw: FormDataEntryValue | null): Date {
  const dateKey = String(raw ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return new Date()
  const parsed = getShiftWindowForDate(dateKey, "Day").start
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export async function retireVehicle(formData: FormData) {
  const serial = String(formData.get("serial") ?? "")
  if (!serial) return

  const cookieStore = await cookies()
  const managerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value || "Unknown"

  await prisma.equipment.update({
    where: { serial },
    data: { retiredAt: retirementInstant(formData.get("retiredOn")), retiredBy: managerName },
  })

  refreshManagePaths()
}

export async function retireVehicles(formData: FormData) {
  const serials = formData.getAll("serial").map(String).filter(Boolean)
  if (serials.length === 0) return

  const cookieStore = await cookies()
  const managerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value || "Unknown"

  await prisma.equipment.updateMany({
    where: { serial: { in: serials } },
    data: { retiredAt: retirementInstant(formData.get("retiredOn")), retiredBy: managerName },
  })

  refreshManagePaths()
}

export async function restoreVehicle(formData: FormData) {
  const serial = String(formData.get("serial") ?? "")
  if (!serial) return

  await prisma.equipment.update({
    where: { serial },
    data: { retiredAt: null, retiredBy: null },
  })

  refreshManagePaths()
}
