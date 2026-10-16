import { NextRequest, NextResponse } from "next/server"
import { runPhotoBackup } from "@/lib/photoBackup"

// Copies new inspection photos into the backup bucket (see photoBackup.ts).
// Same guard as the retention cron: Vercel Cron sends
// `Authorization: Bearer ${CRON_SECRET}`, everyone else is rejected.
//
// Scheduled in vercel.json daily at 07:30 UTC — 3:30am EDT / 2:30am EST,
// mid night shift — so a photo is at most a day without a copy.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authHeader = request.headers.get("authorization")
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Dry run by default (counts only), like the retention cron; only the
  // vercel.json entry passes dryRun=false.
  const dryRun = request.nextUrl.searchParams.get("dryRun") !== "false"
  const result = await runPhotoBackup({ dryRun })
  return NextResponse.json(result, { status: result.error || result.failed.length ? 500 : 200 })
}
