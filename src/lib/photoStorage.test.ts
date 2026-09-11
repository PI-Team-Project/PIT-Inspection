import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  photoObjectPath,
  isPhotoStorageConfigured,
  resolvePhotoSources,
  uploadPhoto,
  signedPhotoUrls,
} from "./photoStorage"

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe("photoObjectPath", () => {
  it("groups by vehicle then inspection, and names by question and slot", () => {
    expect(photoObjectPath("A4BC150348", "insp123", "horn", 0)).toBe(
      "A4BC150348/insp123/horn-0.jpg"
    )
  })

  it("is stable for the same slot, so a retry overwrites instead of orphaning", () => {
    const a = photoObjectPath("S1", "i1", "tires", 2)
    const b = photoObjectPath("S1", "i1", "tires", 2)
    expect(a).toBe(b)
  })

  it("never lets an empty part collapse two vehicles into one prefix", () => {
    expect(photoObjectPath("", "i1", "horn", 0)).toBe("unknown/i1/horn-0.jpg")
  })

  it("neutralises anything that would break out of the key namespace", () => {
    // A serial is operator-entered, so it must never be able to reach
    // another vehicle's prefix or escape the bucket root.
    const path = photoObjectPath("../../etc", "i/1", "q id", 0)
    expect(path).not.toContain("..")
    expect(path.split("/")).toHaveLength(3)
    expect(path).toBe("______etc/i_1/q_id-0.jpg")
  })
})

describe("without credentials", () => {
  it("reports storage as unconfigured", () => {
    expect(isPhotoStorageConfigured()).toBe(false)
  })

  it("returns null from upload rather than throwing, so submission can fall back", async () => {
    await expect(uploadPhoto("a/b/c-0.jpg", Buffer.from("x"))).resolves.toBeNull()
  })

  it("returns no signed urls rather than throwing", async () => {
    await expect(signedPhotoUrls(["a/b/c-0.jpg"])).resolves.toEqual(new Map())
  })
})

describe("resolvePhotoSources", () => {
  const base = { questionId: "horn", order: 0, note: null, inspectionId: "i1" }

  it("falls back to an inline data URI when there is no storage path", async () => {
    const out = await resolvePhotoSources([
      { ...base, storagePath: null, dataUri: "data:image/jpeg;base64,AAA" },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].src).toBe("data:image/jpeg;base64,AAA")
  })

  it("drops a stored photo that cannot be signed instead of rendering it broken", async () => {
    // No credentials here, so signing yields nothing — the surrounding
    // answer and note must still render.
    const out = await resolvePhotoSources([
      { ...base, storagePath: "S1/i1/horn-0.jpg", dataUri: null },
    ])
    expect(out).toEqual([])
  })

  it("keeps the other fields so callers can regroup by inspection", async () => {
    const out = await resolvePhotoSources([
      { ...base, order: 3, storagePath: null, dataUri: "data:image/jpeg;base64,BBB" },
    ])
    expect(out[0].inspectionId).toBe("i1")
    expect(out[0].order).toBe(3)
    expect(out[0].questionId).toBe("horn")
  })

  it("handles an empty list without calling out to storage", async () => {
    await expect(resolvePhotoSources([])).resolves.toEqual([])
  })
})
