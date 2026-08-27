import ExcelJS from "exceljs"
import type { Inspection } from "@/generated/prisma/client"
import { QUESTIONS } from "@/lib/questions"
import { buildExportRow } from "@/lib/exportRow"

// Excel sheet names: max 31 chars, none of \ / ? * [ ] :, and must be
// unique within the workbook. Every real FL# is already short, plain, and
// one-per-vehicle, but seed/demo rows can share a generic placeholder
// label ("Seed data") across several different serials with no real FL#
// recorded — so a straight FL#-derived name can collide, and ExcelJS
// throws rather than silently overwriting a sheet. usedNames tracks what's
// already taken; a collision falls back to appending a short serial
// fragment so every vehicle still gets its own tab instead of the export
// failing outright.
function sheetNameFor(flNumber: string, serial: string, usedNames: Set<string>): string {
  const base = (flNumber.replace(/[\\/?*[\]:]/g, "-").trim() || "Vehicle").slice(0, 31)
  if (!usedNames.has(base)) {
    usedNames.add(base)
    return base
  }
  const suffix = ` (${serial.slice(-4)})`
  const disambiguated = (base.slice(0, 31 - suffix.length) + suffix).slice(0, 31)
  usedNames.add(disambiguated)
  return disambiguated
}

const TABLE_HEADERS = [
  "Date",
  "Shift",
  "Inspector",
  "Status",
  ...QUESTIONS.map((q) => `${q.number}. ${q.label}`),
  "Repair Description",
  "Notes / Activity",
]

// One tab per vehicle (named by FL#), the vehicle's full name as a title
// row, then a table with the checklist questions as columns and notes as
// the trailing column — the format asked for: "vehicle per tab, top
// columns have the questionnaire, notes at the end." Rows run oldest to
// newest, top to bottom, like a diary of that vehicle's history — the
// natural way to read a single vehicle's own trail of inspections.
export async function buildInspectionsExcel(inspections: Inspection[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date()

  const bySerial = new Map<string, Inspection[]>()
  for (const inspection of inspections) {
    const list = bySerial.get(inspection.equipmentSerial)
    if (list) list.push(inspection)
    else bySerial.set(inspection.equipmentSerial, [inspection])
  }

  // Alphabetical by FL# so tab order is predictable — nothing about
  // urgency or recency survives an export anyway, so there's no "sort by
  // severity" reason to prefer any other order here the way the live
  // dashboard does.
  const bySerialSorted = [...bySerial.entries()].sort((a, b) => {
    const flA = a[1][0].equipmentLabel.split(" — ")[0]
    const flB = b[1][0].equipmentLabel.split(" — ")[0]
    return flA.localeCompare(flB, undefined, { numeric: true })
  })

  const usedSheetNames = new Set<string>()
  for (const [serial, vehicleInspections] of bySerialSorted) {
    const flNumber = vehicleInspections[0].equipmentLabel.split(" — ")[0]
    const sheet = workbook.addWorksheet(sheetNameFor(flNumber, serial, usedSheetNames))

    const titleRow = sheet.addRow([vehicleInspections[0].equipmentLabel])
    titleRow.font = { bold: true, size: 14 }
    sheet.mergeCells(titleRow.number, 1, titleRow.number, TABLE_HEADERS.length)
    sheet.addRow([])

    const headerRow = sheet.addRow(TABLE_HEADERS)
    headerRow.font = { bold: true }
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } }
      cell.border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } }
    })
    sheet.views = [{ state: "frozen", ySplit: headerRow.number }]

    const sortedInspections = [...vehicleInspections].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )
    for (const inspection of sortedInspections) {
      const row = buildExportRow(inspection)
      sheet.addRow([
        row.date,
        row.shift,
        `${row.firstName} ${row.lastName}`,
        row.status,
        ...row.answerCells,
        row.repairDescription,
        row.activityLog,
      ])
    }

    sheet.columns.forEach((col, i) => {
      const header = TABLE_HEADERS[i] ?? ""
      // Notes/Activity carries long free text — a fixed wide column reads
      // better than trying to auto-fit it to whatever the longest note
      // happens to be, which would blow the sheet out.
      col.width =
        header === "Notes / Activity"
          ? 60
          : header === "Repair Description"
            ? 30
            : Math.min(Math.max(header.length + 2, 10), 24)
    })
  }

  if (workbook.worksheets.length === 0) {
    workbook.addWorksheet("No Data").addRow(["No inspections match this export."])
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
