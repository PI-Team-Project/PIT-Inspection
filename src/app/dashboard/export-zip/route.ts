import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { ZipArchive } from "archiver"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { buildInspectionsExcel } from "@/lib/inspectionsExcel"
import { fetchInspectionsForExport, type ExportRange, type ExportScope } from "@/lib/exportFilter"
import { photoArchivePath } from "@/lib/photoExportNames"
import { photoBytes } from "@/lib/photoStorage"

// The same export as the Excel one, plus the photos it has always been
// missing — a workbook with a Photos column naming each file, and those
// files beside it:
//
//   pit-inspections-2026-09-12.xlsx
//   photos/M-MIT-0498/2026-09-11_Day_03-battery-plug_1.jpg
//
// A row cites the exact path, and the path says which vehicle, day, shift
// and checklist item the picture belongs to, so either half can be read on
// its own. Photos sit under one folder per vehicle rather than one giant
// directory, because a supervisor asked for a vehicle's evidence wants a
// folder, not a filter.

// A full year of a busy fleet can reach a few thousand photos, and a
// serverless function has a memory ceiling and a deadline. This caps what
// one archive will carry and says so in the zip rather than truncating in
// silence or timing out halfway through a download.
const MAX_PHOTOS_PER_EXPORT = 600

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  if (cookieStore.get(DASHBOARD_COOKIE)?.value !== dashboardSessionValue()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const { inspections, todayKey, suffix, where } = await fetchInspectionsForExport({
    range: (params.get("range") ?? "all") as ExportRange,
    scope: (params.get("scope") ?? "all") as ExportScope,
    customFrom: params.get("from"),
    customTo: params.get("to"),
    serials: params.get("serials")?.split(",").filter(Boolean),
  })

  const byId = new Map(inspections.map((i) => [i.id, i]))

  // Joined on the export's own filter rather than on a list of ids: an
  // all-time export selects ~22k inspections, and feeding that many ids
  // back through an IN clause cost 35 of the 40 seconds this once took.
  //
  // Metadata only, and bounded by `take`. Selecting dataUri here would drag
  // every inline photo's bytes across — about 150MB for a year of records —
  // just to discard all but the first few hundred, which was the remaining
  // 15 seconds.
  const photoMeta = await prisma.photo.findMany({
    where: { inspection: where },
    orderBy: [{ inspectionId: "asc" }, { questionId: "asc" }, { order: "asc" }],
    take: MAX_PHOTOS_PER_EXPORT,
    select: { id: true, inspectionId: true, questionId: true, order: true, storagePath: true },
  })
  const totalPhotos = await prisma.photo.count({ where: { inspection: where } })
  const capped = totalPhotos > photoMeta.length
  const included = photoMeta

  // Inline bytes for the rows that predate object storage — fetched only for
  // what actually goes in the archive.
  const inlineIds = included.filter((p) => !p.storagePath).map((p) => p.id)
  const inlineById = new Map(
    inlineIds.length === 0
      ? []
      : (
          await prisma.photo.findMany({
            where: { id: { in: inlineIds } },
            select: { id: true, dataUri: true },
          })
        ).map((r) => [r.id, r.dataUri] as const)
  )

  // Built from the same helper the archive uses, so the cell and the file
  // can never drift apart.
  const pathsByInspection = new Map<string, string[]>()
  const plan: { path: string; photo: (typeof included)[number] }[] = []
  for (const photo of included) {
    const inspection = byId.get(photo.inspectionId)
    if (!inspection) continue
    const path = photoArchivePath(inspection, photo.questionId, photo.order)
    const list = pathsByInspection.get(photo.inspectionId)
    if (list) list.push(path)
    else pathsByInspection.set(photo.inspectionId, [path])
    plan.push({ path, photo })
  }

  const workbook = await buildInspectionsExcel(inspections, pathsByInspection)

  // archiver 8 exports classes rather than the old archiver("zip", ...)
  // factory; that factory is gone, and calling it fails only at runtime.
  const archive = new ZipArchive({ zlib: { level: 6 } })
  const name = `pit-inspections${suffix ? `-${suffix}` : ""}-${todayKey}`

  // Streamed rather than buffered: the workbook is small but the photos are
  // not, and holding a few hundred megabytes in memory to hand it over in
  // one piece is how this would fall over first.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      archive.on("end", () => controller.close())
      archive.on("error", (err: Error) => controller.error(err))

      archive.append(workbook, { name: `${name}.xlsx` })

      void (async () => {
        let written = 0
        const missing: string[] = []
        // Fetched in parallel batches, appended in order. One at a time
        // meant 600 photos took 34s — each object is a separate round trip
        // to storage, so the wall clock was almost all waiting, and a
        // serverless function would hit its deadline long before finishing.
        // Batching keeps memory bounded to a handful of photos at once
        // while cutting that to a few seconds.
        const BATCH = 12
        for (let i = 0; i < plan.length; i += BATCH) {
          const batch = plan.slice(i, i + BATCH)
          const fetched = await Promise.all(
            batch.map(async ({ path, photo }) => ({
              path,
              bytes: await photoBytes({
                storagePath: photo.storagePath,
                dataUri: inlineById.get(photo.id) ?? null,
              }),
            }))
          )
          for (const { path, bytes } of fetched) {
            if (!bytes) {
              // One unreadable object must not cost the whole export; it is
              // listed at the end instead.
              missing.push(path)
              continue
            }
            // store, not deflate — a JPEG does not compress, and trying
            // cost 450ms across 600 files for 2% more size.
            archive.append(bytes, { name: path, store: true })
            written++
          }
        }

        // A short note, only when there is something a reader needs to know
        // — an export that is complete says nothing.
        if (capped || missing.length > 0) {
          const lines = ["PIT inspection photo export", ""]
          if (capped) {
            lines.push(
              `This archive carries the first ${included.length} of ${totalPhotos} photos`,
              "in the selected range. Narrow the date range or pick specific",
              "vehicles to get the rest.",
              ""
            )
          }
          if (missing.length > 0) {
            lines.push(
              `${missing.length} photo${missing.length === 1 ? "" : "s"} could not be read and`,
              "are absent from this archive. The spreadsheet still lists them:",
              "",
              ...missing.map((m) => `  ${m}`),
              ""
            )
          }
          lines.push(`Photos included: ${written}`, `Inspections: ${inspections.length}`)
          archive.append(lines.join("\n"), { name: "README.txt" })
        }

        await archive.finalize()
      })()
    },
    cancel() {
      archive.abort()
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "no-store",
    },
  })
}
