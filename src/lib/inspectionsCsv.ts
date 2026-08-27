import type { Inspection } from "@/generated/prisma/client"
import { QUESTIONS } from "@/lib/questions"
import { buildExportRow } from "@/lib/exportRow"

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function toCsvRow(cells: string[]): string {
  return cells.map(csvCell).join(",")
}

export function buildInspectionsCsv(inspections: Inspection[]): string {
  const headers = [
    "Submitted At (ET)",
    "Type",
    "Date",
    "Shift",
    "Last Name",
    "First Name",
    "Equipment",
    "Serial#",
    "Status",
    "Repair Description",
    ...QUESTIONS.map((q) => `${q.number}. ${q.label}`),
    "Activity Log",
  ]

  const rows = inspections.map((inspection) => {
    const row = buildExportRow(inspection)
    return toCsvRow([
      row.submittedAt,
      row.type,
      row.date,
      row.shift,
      row.lastName,
      row.firstName,
      row.equipmentLabel,
      row.equipmentSerial,
      row.status,
      row.repairDescription,
      ...row.answerCells,
      row.activityLog,
    ])
  })

  return [toCsvRow(headers), ...rows].join("\r\n")
}
