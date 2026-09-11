import { QUESTIONS_BY_ID, REPAIR_REQUEST_ISSUE_ID } from "@/lib/questions"

// Names the files inside a photo export so that a row in the spreadsheet and
// a file on disk point at each other without anyone having to cross-reference
// ids. Someone handed the zip alone should still be able to say which vehicle,
// which day, which shift and which checklist item a picture belongs to.
//
//   photos/M-MIT-0498/2026-09-11_Day_03-battery-plug_1.jpg
//          └ FL#      └ date     └ shift └ item      └ nth photo of that item
//
// The question NUMBER leads the item part so files sort in checklist order
// rather than alphabetically — "03-battery-plug" before "07-horn", which is
// the order the inspector answered them in.

// Filenames end up on Windows, macOS and inside email clients, so this keeps
// to characters all of them accept and none of them treat as special.
function safe(part: string): string {
  return (
    part
      .normalize("NFKD")
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "unknown"
  )
}

// The folder for one vehicle: its FL#, which is what is painted on the
// machine and what a supervisor would say out loud. Falls back to the serial
// when a record predates FL# being recorded.
export function photoFolderName(equipmentLabel: string, equipmentSerial: string): string {
  const flNumber = equipmentLabel.split(" — ")[0]?.trim()
  return safe(flNumber && flNumber !== equipmentLabel ? flNumber : equipmentSerial)
}

export function photoFileName(inspection: {
  date: string
  shift: string
  type: string
}, questionId: string, order: number): string {
  const question =
    questionId === REPAIR_REQUEST_ISSUE_ID ? undefined : QUESTIONS_BY_ID[questionId]
  // A repair request has no checklist item, so it is named for what it is
  // and sorted to the front with 00 — it is the reason the photos exist.
  const item = question
    ? `${String(question.number).padStart(2, "0")}-${safe(question.label.toLowerCase())}`
    : "00-repair-request"
  // `order` is the photo slot the inspector used (0-based); humans count
  // from one, and the slot numbers shown on the form start at 1 too.
  return `${safe(inspection.date)}_${safe(inspection.shift)}_${item}_${order + 1}.jpg`
}

// The path as it appears inside the archive, and the exact string written
// into the spreadsheet's Photos column — one value, so the two can never
// disagree.
export function photoArchivePath(
  inspection: { date: string; shift: string; type: string; equipmentLabel: string; equipmentSerial: string },
  questionId: string,
  order: number
): string {
  return `photos/${photoFolderName(inspection.equipmentLabel, inspection.equipmentSerial)}/${photoFileName(inspection, questionId, order)}`
}
