// Creates the private photo bucket and proves the credentials work, by
// doing a real round trip: upload a tiny object, sign it, fetch it back,
// delete it. Safe to re-run — the bucket is only created if missing.
//
//   node scripts/with-env.mjs .env.local -- tsx scripts/setup-photo-bucket.ts
import {
  PHOTO_BUCKET,
  ensurePhotoBucket,
  isPhotoStorageConfigured,
  uploadPhoto,
  signedPhotoUrls,
  deletePhotoObjects,
} from "../src/lib/photoStorage"

async function main() {
  if (!isPhotoStorageConfigured()) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.")
    console.error("Add them to .env.local, then re-run.")
    process.exit(1)
  }

  const bucket = await ensurePhotoBucket()
  if (!bucket.ok) {
    console.error(`could not create or read bucket "${PHOTO_BUCKET}": ${bucket.error}`)
    process.exit(1)
  }
  console.log(`bucket "${PHOTO_BUCKET}": ${bucket.created ? "created (private)" : "already exists"}`)

  // A 1x1 JPEG, so the check costs nothing and leaves nothing behind.
  const probe = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  )
  const path = `_healthcheck/${Date.now()}.jpg`

  const stored = await uploadPhoto(path, probe)
  if (!stored) {
    console.error("upload failed — the key is probably the anon key rather than service_role.")
    process.exit(1)
  }
  console.log(`upload:     ok (${stored})`)

  const urls = await signedPhotoUrls([stored])
  const url = urls.get(stored)
  if (!url) {
    console.error("signing failed")
    process.exit(1)
  }
  console.log(`signed url: ok`)

  const res = await fetch(url)
  console.log(`fetch back: ${res.ok ? `ok (${res.status}, ${res.headers.get("content-type")})` : `FAILED ${res.status}`}`)
  if (!res.ok) process.exit(1)

  // The bucket must NOT be readable without a signature.
  const unsigned = url.split("?")[0]
  const open = await fetch(unsigned)
  console.log(`private:    ${open.ok ? "NO — bucket is public, fix this" : `yes (unsigned fetch returns ${open.status})`}`)

  await deletePhotoObjects([stored])
  console.log("cleanup:    ok\n\nphoto storage is ready.")
}
main().catch((e) => { console.error(e); process.exit(1) })
