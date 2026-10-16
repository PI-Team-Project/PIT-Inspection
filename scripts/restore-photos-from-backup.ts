// Puts photos back into inspection-photos from inspection-photos-backup —
// only the ones missing upstream, under their original keys, so the
// inspections that reference them show their photos again. Never overwrites
// or deletes.
//
// Dry run first (counts only):
//   node scripts/with-env.mjs .env.local -- node scripts/with-env.mjs .env -- tsx scripts/restore-photos-from-backup.ts
// Then for real, add --apply.
import { restorePhotosFromBackup } from "../src/lib/photoBackup"

async function main() {
  const dryRun = !process.argv.includes("--apply")
  const result = await restorePhotosFromBackup({ dryRun })
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.error || result.failed.length ? 1 : 0)
}

main()
