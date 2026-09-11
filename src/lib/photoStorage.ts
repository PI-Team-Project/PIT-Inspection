import { StorageClient } from "@supabase/storage-js"

// Inspection photos live in a private Supabase Storage bucket rather than
// inline in Postgres, where they were 94-98% of everything stored — roughly
// 602MB a year at the 1280px budget, in the most expensive place to keep an
// image. Postgres now holds only the object key.
//
// Private, not public: these are workplace safety records showing equipment
// and the floor around it. The dashboard is PIN-gated, so its photos should
// not be openly addressable either. The browser gets short-lived signed
// URLs minted per render.
export const PHOTO_BUCKET = "inspection-photos"

// Long enough to read an inspection and open the lightbox, short enough
// that a copied URL is not a lasting way in.
const SIGNED_URL_TTL_SECONDS = 60 * 60

// Server-only. SUPABASE_SERVICE_ROLE_KEY bypasses row-level security, so it
// must never be given a NEXT_PUBLIC_ prefix or referenced from a client
// component — every caller here runs in a server action or a server
// component.
function credentials(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/+$/, ""), key }
}

// Whether photo storage is usable at all. Everything below degrades to
// inline storage when this is false, so a missing environment variable
// slows the database down — it does not stop an inspection being filed.
export function isPhotoStorageConfigured(): boolean {
  return credentials() !== null
}

let cached: StorageClient | null = null

function client(): StorageClient | null {
  if (cached) return cached
  const creds = credentials()
  if (!creds) return null
  cached = new StorageClient(`${creds.url}/storage/v1`, {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
  })
  return cached
}

// Keys are grouped by vehicle then inspection so the bucket browses the way
// the fleet does, and so a future export can pull one vehicle's photos with
// a single prefix listing. questionId and order make the name stable and
// meaningful — "horn-0.jpg" rather than a random id — which also means a
// retried upload overwrites its own object instead of orphaning one.
export function photoObjectPath(
  equipmentSerial: string,
  inspectionId: string,
  questionId: string,
  order: number
): string {
  // Dots are not in the allowed set on purpose. Serials are operator-typed,
  // and permitting "." leaves literal ".." inside a key — harmless here
  // because "/" is also stripped, but it is the kind of thing that stops
  // being harmless the first time a key is handed to something that does
  // resolve paths. An empty part would collapse two separators into one and
  // silently merge namespaces, so it becomes a placeholder instead.
  const safe = (part: string) => part.replace(/[^A-Za-z0-9_-]/g, "_") || "unknown"
  return `${safe(equipmentSerial)}/${safe(inspectionId)}/${safe(questionId)}-${order}.jpg`
}

// Uploads one already-encoded JPEG. Returns the stored key, or null if
// storage is not configured or the upload failed — the caller is expected
// to fall back to inline bytes rather than drop the photo.
export async function uploadPhoto(path: string, jpeg: Buffer): Promise<string | null> {
  const storage = client()
  if (!storage) return null
  try {
    const { data, error } = await storage
      .from(PHOTO_BUCKET)
      .upload(path, jpeg, { contentType: "image/jpeg", upsert: true })
    if (error || !data) {
      console.error("photo upload failed:", error?.message ?? "no data returned")
      return null
    }
    // data.path is the key WITHOUT the bucket prefix — the value the
    // download and signing calls expect. data.Key includes the bucket and
    // must not be stored.
    return data.path ?? path
  } catch (err) {
    console.error("photo upload threw:", err)
    return null
  }
}

// Signed URLs for a batch of object keys, as a key -> URL map. Any key that
// cannot be signed is simply absent, so a single broken object degrades to
// one missing image rather than a failed page render.
export async function signedPhotoUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const unique = [...new Set(paths.filter(Boolean))]
  if (unique.length === 0) return urls

  const storage = client()
  if (!storage) return urls

  try {
    const { data, error } = await storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS)
    if (error || !data) {
      console.error("signing photo urls failed:", error?.message ?? "no data returned")
      return urls
    }
    for (const entry of data) {
      if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl)
    }
  } catch (err) {
    console.error("signing photo urls threw:", err)
  }
  return urls
}

// Deleting an inspection cascades its Photo rows, but object storage knows
// nothing about that — the retention cron calls this so the bucket does not
// accumulate objects whose rows are long gone.
export async function deletePhotoObjects(paths: string[]): Promise<number> {
  const storage = client()
  const unique = [...new Set(paths.filter(Boolean))]
  if (!storage || unique.length === 0) return 0
  let removed = 0
  // The API takes a list, but a very large retention sweep should not be
  // one enormous request.
  const CHUNK = 500
  for (let i = 0; i < unique.length; i += CHUNK) {
    const batch = unique.slice(i, i + CHUNK)
    try {
      const { error } = await storage.from(PHOTO_BUCKET).remove(batch)
      if (error) console.error("deleting photo objects failed:", error.message)
      else removed += batch.length
    } catch (err) {
      console.error("deleting photo objects threw:", err)
    }
  }
  return removed
}

// Creates the bucket if it is missing. Private, and capped well above the
// ~183KB a 1280px photo actually weighs so a rogue upload cannot be huge.
export async function ensurePhotoBucket(): Promise<
  { ok: true; created: boolean } | { ok: false; error: string }
> {
  const storage = client()
  if (!storage) return { ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set" }
  try {
    const existing = await storage.getBucket(PHOTO_BUCKET)
    if (existing.data) return { ok: true, created: false }
    const { error } = await storage.createBucket(PHOTO_BUCKET, {
      public: false,
      allowedMimeTypes: ["image/jpeg", "image/png"],
      fileSizeLimit: "5MB",
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, created: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Turns stored photo rows into something renderable: a signed URL for
// anything in object storage, the inline data URI for anything predating
// the move. One signing call covers every photo on the page rather than one
// per image.
//
// A photo whose object cannot be signed is dropped rather than rendered
// broken — the note and the checklist answer around it still show, which is
// the part that carries the safety record.
export async function resolvePhotoSources<
  T extends { storagePath: string | null; dataUri: string | null },
>(photos: T[]): Promise<(T & { src: string })[]> {
  const urls = await signedPhotoUrls(photos.map((p) => p.storagePath ?? "").filter(Boolean))
  return photos.flatMap((photo) => {
    const src = photo.storagePath ? urls.get(photo.storagePath) : photo.dataUri
    return src ? [{ ...photo, src }] : []
  })
}
