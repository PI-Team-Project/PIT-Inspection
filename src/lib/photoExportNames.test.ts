import { describe, it, expect } from "vitest"
import { photoFolderName, photoFileName, photoArchivePath } from "./photoExportNames"

const insp = {
  date: "2026-09-11",
  shift: "Day",
  type: "Daily",
  equipmentLabel: "M-MIT-0498 — Mint Mitsubishi (Sit Down)",
  equipmentSerial: "AFB2600498",
}

describe("photoFolderName", () => {
  it("uses the FL#, which is what is painted on the machine", () => {
    expect(photoFolderName(insp.equipmentLabel, insp.equipmentSerial)).toBe("M-MIT-0498")
  })

  it("falls back to the serial when no FL# was recorded", () => {
    expect(photoFolderName("Seed data", "AFB2600498")).toBe("AFB2600498")
  })

  it("strips anything a filesystem would object to", () => {
    expect(photoFolderName("../etc — x (y)", "s")).not.toContain("/")
    expect(photoFolderName("", "")).toBe("unknown")
  })
})

describe("photoFileName", () => {
  it("leads the item with its question number so files sort in checklist order", () => {
    const third = photoFileName(insp, "batteryPlug", 0)
    const seventh = photoFileName(insp, "horn", 0)
    expect(third).toBe("2026-09-11_Day_03-battery-plug_1.jpg")
    expect(seventh).toBe("2026-09-11_Day_07-horn_1.jpg")
    expect([seventh, third].sort()).toEqual([third, seventh])
  })

  it("counts photos from 1, matching the slot numbers on the form", () => {
    expect(photoFileName(insp, "horn", 0)).toContain("_1.jpg")
    expect(photoFileName(insp, "horn", 3)).toContain("_4.jpg")
  })

  it("sorts a repair request ahead of the checklist — it is why the photos exist", () => {
    const repair = photoFileName(insp, "repairRequest", 0)
    expect(repair).toBe("2026-09-11_Day_00-repair-request_1.jpg")
    expect([photoFileName(insp, "tires", 0), repair].sort()[0]).toBe(repair)
  })

  it("keeps the shift in the name so a Day and Night photo of one item never collide", () => {
    const day = photoFileName({ ...insp, shift: "Day" }, "horn", 0)
    const night = photoFileName({ ...insp, shift: "Night" }, "horn", 0)
    expect(day).not.toBe(night)
  })

  it("handles a label with a slash without creating a folder", () => {
    // "Lift/Lowering Movement" and "Fluid Levels/Battery" both contain one.
    expect(photoFileName(insp, "liftLowering", 0)).not.toContain("/")
    expect(photoFileName(insp, "fluidBattery", 0)).not.toContain("/")
  })
})

describe("photoArchivePath", () => {
  it("is the same string the spreadsheet cites, so the two cannot disagree", () => {
    expect(photoArchivePath(insp, "horn", 0)).toBe(
      "photos/M-MIT-0498/2026-09-11_Day_07-horn_1.jpg"
    )
  })

  it("never escapes the photos folder", () => {
    const path = photoArchivePath(
      { ...insp, equipmentLabel: "../../x", equipmentSerial: "../y", date: "../z" },
      "horn",
      0
    )
    expect(path.startsWith("photos/")).toBe(true)
    expect(path).not.toContain("..")
    expect(path.split("/")).toHaveLength(3)
  })
})
