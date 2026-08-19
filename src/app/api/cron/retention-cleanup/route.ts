import { NextRequest, NextResponse } from "next/server"
import { runRetentionCleanup } from "@/lib/retention"

// Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
// once CRON_SECRET is set as an env var — this rejects anyone else,
// since real deletion is otherwise a single unauthenticated GET away.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Defaults to a dry run (counts only, deletes nothing) so hitting this
  // manually is always safe — vercel.json's cron entry is the only thing
  // that should ever pass dryRun=false.
  const dryRun = request.nextUrl.searchParams.get("dryRun") !== "false"

  // Authenticated-only preview knob — "what would this delete a year from
  // now" — useful for verifying the cutoff logic without needing to wait
  // for real data to age past retention.
  const nowParam = request.nextUrl.searchParams.get("now")
  const now = nowParam ? new Date(nowParam) : undefined

  const result = await runRetentionCleanup({ dryRun, now })
  return NextResponse.json(result)
}
