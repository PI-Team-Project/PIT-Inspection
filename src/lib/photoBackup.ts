import { prisma } from "./prisma"
import { PHOTO_BUCKET, client } from "./photoStorage"

// A second, private bucket in the same Supabase project holding a copy of
// every inspection photo under the same key.
//
// Why it exists: Supabase's daily backups cover Postgres only — "Database
// backups do not include objects you store via the Storage API" — so a photo
// deleted from inspection-photos (by hand in the Supabase dashboard, or by a
// mistake in code) could not be brought back, and the inspection would show
// with its photo missing. The rows that point at a photo ARE backed up, so
// restoring the object under its old key is all it takes to make the
// inspection whole again in the app.
//
// Add-only: nothing is ever deleted from here, not even by retention, so a
// deletion upstream can't be mirrored into the copy. Same project, so it
// does not protect against losing the Supabase project itself.
export const PHOTO_BACKUP_BUCKET = "inspection-photos-backup"

// One run's ceiling. A normal day adds a handful of photos; this only bites
// on the first run or after a long outage, and the next run picks up the rest.
const MAX_COPIES_PER_RUN = 500

export type PhotoSyncResult = {
  dryRun: boolean
  from: string
  to: string
  sourceObjects: number
  alreadyCopied: number
  missing: number
  copied: number
  failed: { key: string; error: string }[]
  error?: string
}

async function ensureBackupBucket(): Promise<string | null> {
  const storage = client()
  if (!storage) return "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"
  const existing = await storage.getBucket(PHOTO_BACKUP_BUCKET)
  if (existing.data) return null
  const { error } = await storage.createBucket(PHOTO_BACKUP_BUCKET, {
    public: false,
    allowedMimeTypes: ["image/jpeg", "image/png"],
    fileSizeLimit: "5MB",
  })
  return error ? error.message : null
}

// Object keys straight from Supabase's own storage.objects table — one query
// per bucket instead of walking the folder tree through the list API, which
// is not recursive. The app connects as postgres, which can read it.
async function objectKeys(bucket: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    select name from storage.objects where bucket_id = ${bucket}
  `
  return new Set(rows.map((r) => r.name))
}

// Copies every object in `from` that `to` doesn't have yet, server-side
// (Supabase copies between buckets without the bytes passing through here).
// Never overwrites and never deletes.
async function syncBuckets(from: string, to: string, dryRun: boolean): Promise<PhotoSyncResult> {
  const result: PhotoSyncResult = {
    dryRun,
    from,
    to,
    sourceObjects: 0,
    alreadyCopied: 0,
    missing: 0,
    copied: 0,
    failed: [],
  }
  const storage = client()
  if (!storage) return { ...result, error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set" }

  const [source, target] = await Promise.all([objectKeys(from), objectKeys(to)])
  const missing = [...source].filter((key) => !target.has(key))
  result.sourceObjects = source.size
  result.alreadyCopied = source.size - missing.length
  result.missing = missing.length
  if (dryRun) return result

  for (const key of missing.slice(0, MAX_COPIES_PER_RUN)) {
    const { error } = await storage.from(from).copy(key, key, { destinationBucket: to })
    if (error) result.failed.push({ key, error: error.message })
    else result.copied++
  }
  return result
}

// Daily: inspection-photos -> inspection-photos-backup.
export async function runPhotoBackup({ dryRun }: { dryRun: boolean }): Promise<PhotoSyncResult> {
  if (!dryRun) {
    const bucketError = await ensureBackupBucket()
    if (bucketError) {
      return {
        dryRun,
        from: PHOTO_BUCKET,
        to: PHOTO_BACKUP_BUCKET,
        sourceObjects: 0,
        alreadyCopied: 0,
        missing: 0,
        copied: 0,
        failed: [],
        error: bucketError,
      }
    }
  }
  return syncBuckets(PHOTO_BUCKET, PHOTO_BACKUP_BUCKET, dryRun)
}

// The way back: puts any photo missing from inspection-photos back from the
// copy, under the same key, so the app shows it again. Run by hand — see
// scripts/restore-photos-from-backup.ts.
export async function restorePhotosFromBackup({ dryRun }: { dryRun: boolean }): Promise<PhotoSyncResult> {
  return syncBuckets(PHOTO_BACKUP_BUCKET, PHOTO_BUCKET, dryRun)
}
