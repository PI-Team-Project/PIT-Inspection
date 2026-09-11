import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { PHOTO_BUCKET, isPhotoStorageConfigured, uploadPhoto, signedPhotoUrls, deletePhotoObjects } from "@/lib/photoStorage"

// Answers one question that is otherwise unanswerable from outside: does the
// RUNNING deployment actually have working photo storage?
//
// Environment variables are set per-environment in the hosting dashboard and
// only take effect on a fresh build, so "I added them" and "the function can
// see them" are different facts — and the only symptom of the gap is photos
// quietly falling back to inline storage, which looks identical to success.
//
// Never returns a secret. Presence, lengths and shape only, plus a real
// round trip so a present-but-wrong key is distinguishable from a missing
// one. Behind the dashboard session, because even the shape of a
// misconfiguration is not worth publishing.
export async function GET() {
  const cookieStore = await cookies()
  if (cookieStore.get(DASHBOARD_COOKIE)?.value !== dashboardSessionValue()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  const env = {
    SUPABASE_URL: {
      present: Boolean(url),
      length: url?.length ?? 0,
      // The host is not a secret and is the field most likely to be wrong.
      host: url ? new URL(url).host : null,
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      present: Boolean(key),
      length: key?.length ?? 0,
      // A service_role key is a JWT: three dot-separated parts, ~200-300
      // chars. An anon key looks identical here, so the role claim below is
      // what actually tells them apart.
      looksLikeJwt: Boolean(key && key.split(".").length === 3),
      role: (() => {
        if (!key) return null
        try {
          const part = key.split(".")[1]
          const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8"))
          return typeof json.role === "string" ? json.role : null
        } catch {
          return null
        }
      })(),
      hasWhitespace: Boolean(key && key !== key.trim()),
    },
  }

  if (!isPhotoStorageConfigured()) {
    return NextResponse.json({
      ok: false,
      reason: "storage not configured — photos are falling back to inline database storage",
      bucket: PHOTO_BUCKET,
      env,
    })
  }

  // Prove it end to end rather than trusting the variables: a 1x1 JPEG
  // uploaded, signed, fetched back and removed.
  const probe = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  )
  const path = `_healthcheck/${Date.now()}.jpg`
  const stored = await uploadPhoto(path, probe)
  const signed = stored ? (await signedPhotoUrls([stored])).get(stored) : undefined
  let fetched: number | null = null
  if (signed) {
    try {
      fetched = (await fetch(signed)).status
    } catch {
      fetched = null
    }
  }
  if (stored) await deletePhotoObjects([stored])

  const ok = Boolean(stored && signed && fetched === 200)
  return NextResponse.json({
    ok,
    reason: ok ? "photo storage is working" : "configured, but the round trip failed",
    bucket: PHOTO_BUCKET,
    roundTrip: { uploaded: Boolean(stored), signed: Boolean(signed), fetchStatus: fetched },
    env,
  })
}
