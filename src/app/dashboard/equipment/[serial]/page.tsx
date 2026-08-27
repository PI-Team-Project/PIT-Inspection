import { Fragment } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import {
  QUESTIONS,
  QUESTIONS_BY_ID,
  needsAttention,
  REPAIR_REQUEST_ISSUE_ID,
  REPAIR_REQUEST_QUESTION,
} from "@/lib/questions"
import { equipmentTypeLabel } from "@/lib/equipment"
import {
  getEquipmentBySerial,
  getEquipmentCreatedAt,
  EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT,
} from "@/lib/equipmentLocations"
import { isCriticalInspection, isCriticalFlag, type ActivityEntry, type Stage } from "@/lib/review"
import { FLEET_TIME_ZONE, easternDateKey } from "@/lib/shifts"
import { DASHBOARD_COOKIE, MANAGER_NAME_COOKIE, dashboardSessionValue } from "@/lib/auth"
import {
  buildRow,
  badSince,
  findAllOpenIssues,
  retentionCutoff,
  daysPassedCount,
  type InspectionRow,
} from "../../inspectionRow"
import StatusDot from "../../StatusDot"
import PhotoGallery from "../../PhotoGallery"
import LocationChangeControl from "../../LocationChangeControl"
import SignConfirmButton from "../../SignConfirmButton"
import { saveActivity } from "../../actions"
import VehicleHistory, { type LogEntry } from "./VehicleHistory"
import ExportOptions from "../../ExportOptions"

// A date KEY ("2026-08-07") has no time zone of its own — formatting as UTC
// (not the server's local zone) guarantees the digits shown always match
// the digits in the key, with no drift. Used for the short, readable dates
// in the "click to review" sentences below (e.g. "Aug 7").
function shortDate(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serial: string }>
  searchParams: Promise<{ date?: string; shift?: string }>
}) {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    redirect("/dashboard")
  }

  const { serial } = await params
  const { date: highlightDate, shift: highlightShift } = await searchParams
  const savedManagerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value ?? ""
  // The fleet's Eastern calendar date, not the server's own — Vercel runs
  // in UTC, and a plain `new Date().toISOString()` would silently roll
  // over to tomorrow for roughly 4-5 hours every evening (8pm-midnight
  // Eastern), shifting the retention cutoff and "since"/days-passed math
  // below a day early during that window.
  const today = easternDateKey(new Date())
  const todayDisplay = new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date())

  const equipment = await getEquipmentBySerial(serial)
  if (!equipment) notFound()
  const addedAt = await getEquipmentCreatedAt(serial)

  const cutoff = retentionCutoff(equipment.type, today)
  const where = { equipmentSerial: serial, date: { gte: cutoff } }

  // Photos aren't needed for the calendar/log views or for finding which
  // inspection is "selected" below — only the one inspection actually
  // rendered in detail needs its photo bytes, fetched separately once it's
  // known which one that is. Retention already bounds this to at most a
  // few years of twice-daily rows per vehicle, so one full-range query
  // (versus the fleet-wide dashboard query this app already had to fix)
  // stays cheap.
  const allInspections = await prisma.inspection.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })
  const allHistory = allInspections.map(buildRow)
  const latest = allHistory[0]
  // A vehicle's status is the most severe still-unconfirmed issue anywhere
  // in its history, not just whatever its latest inspection happened to
  // report — a later "all good" shift must never silently clear an
  // outstanding flag nobody actually reviewed. See findOpenIssue.
  // Every still-open inspection, worst/oldest first — not just the single
  // worst one. A vehicle can carry more than one independently (two separate
  // Repair Requests days apart, say) — confirming the newer one never
  // touches the older one, so a manager needs to know there's a second item
  // waiting even after clearing the one the badge below jumps to first.
  const openIssues = findAllOpenIssues(allHistory)
  const openIssue = openIssues[0] ?? null
  const stage = (openIssue?.stage ?? latest?.stage ?? "none") as Stage | "none"
  const since = badSince(allHistory, today)
  const daysPassed = since ? daysPassedCount(since, today) : 0

  // The page never drops straight into an inspection unless the visitor
  // explicitly asked for one via a specific day — entry points that already
  // know which day matter (a flagged square in the Weekly Report, a row in
  // this vehicle's own History, a calendar date) link straight to that day.
  // Landing on the vehicle by name always lands on the overview instead,
  // with the verdict badge itself linking to the open issue if there is
  // one — see below — rather than the whole questionnaire appearing
  // unasked-for.
  //
  // A day can carry BOTH a Day and a Night inspection — every link into a
  // specific date (whichever shift it names, or none) shows every
  // inspection that actually happened that day together, Day before Night,
  // rather than forcing a pick of just one. `highlightShift` still narrows
  // which one the breadcrumb names and which one a same-day link came from,
  // but never hides the other.
  const SHIFT_SORT_ORDER: Record<string, number> = { Day: 0, Night: 1 }
  const matchingRows = highlightDate
    ? allHistory
        .filter((row) => row.inspection.date === highlightDate)
        .sort(
          (a, b) =>
            (SHIFT_SORT_ORDER[a.inspection.shift] ?? 2) - (SHIFT_SORT_ORDER[b.inspection.shift] ?? 2)
        )
    : []
  const matchingIds = matchingRows.map((row) => row.inspection.id)

  const selectedInspections = matchingIds.length
    ? await prisma.inspection.findMany({ where: { id: { in: matchingIds } }, include: { photos: true } })
    : []
  // Refetched rows can come back in any order — matchingIds already carries
  // the Day-before-Night order decided above, so re-derive from that.
  const selectedRows: InspectionRow[] = matchingIds
    .map((id) => selectedInspections.find((i) => i.id === id))
    .filter((i) => i !== undefined)
    .map(buildRow)

  // A single, always-in-the-same-place verdict — the one thing a manager
  // actually needs to know before reading anything else on the page.
  const verdict =
    stage === "unresolved"
      ? { label: "Needs Review", badge: "bg-red-50 text-red-700", text: "text-red-700" }
      : stage === "pending-confirm"
        ? { label: "Needs Attention", badge: "bg-amber-50 text-amber-700", text: "text-amber-700" }
        : stage === "none"
          ? { label: "No Inspections Yet", badge: "bg-gray-100 text-gray-500", text: "text-gray-500" }
          : { label: "All Clear", badge: "bg-green-50 text-green-700", text: "text-green-700" }

  const logEntries: LogEntry[] = allHistory.map((row) => ({
    id: row.inspection.id,
    date: row.inspection.date,
    shift: row.inspection.shift as "Day" | "Night",
    inspectorName: `${row.inspection.firstName} ${row.inspection.lastName}`,
    stage: row.stage,
    issueSummary:
      row.flagged.length === 0
        ? null
        : row.flagged.length === 1
          ? row.flagged[0].label
          : `${row.flagged[0].label} +${row.flagged.length - 1} more`,
  }))

  // Browsing a specific past day is a lookup, not an alert — even a day
  // that was unresolved at the time shouldn't paint the whole page red
  // when you're just checking history. Only the vehicle's CURRENT state
  // (the top-level `stage`, driving the verdict badge) earns that weight,
  // and only when nothing else was explicitly asked for.
  const isBrowsingHistory = Boolean(highlightDate)
  const zoneTone = isBrowsingHistory
    ? "border-gray-300 bg-white"
    : stage === "unresolved"
      ? "border-red-300 bg-red-50/40"
      : stage === "pending-confirm"
        ? "border-amber-300 bg-amber-50/40"
        : "border-gray-300 bg-white"

  // Capped at 2xl (not lg:4xl) and never wider — this is a page of short
  // text lines and a handful of narrow columns, not a wide table like the
  // dashboard's Weekly Report. Growing the container past a comfortable
  // reading width just left every card stretched with a lot of dead space,
  // regardless of how big the screen actually is.
  return (
    <main className="mx-auto max-w-lg px-2 py-8 sm:max-w-2xl sm:px-4">
      {/* One breadcrumb instead of two competing "back" links — it always
          says exactly where you are (Fleet, this vehicle, optionally a
          specific day) and every level but the current one is a link. */}
      <nav className="mb-4 flex items-center gap-1.5 text-sm font-medium text-gray-500">
        <Link href="/dashboard" className="hover:text-gray-700 hover:underline">
          Fleet
        </Link>
        <span className="text-gray-300">›</span>
        {isBrowsingHistory ? (
          <Link
            href={`/dashboard/equipment/${serial}`}
            className="hover:text-gray-700 hover:underline"
          >
            {equipment.flNumber}
          </Link>
        ) : (
          <span className="text-gray-700">{equipment.flNumber}</span>
        )}
        {isBrowsingHistory && (
          <>
            <span className="text-gray-300">›</span>
            <span className="text-gray-700">
              {highlightDate}
              {highlightShift ? ` · ${highlightShift}` : ""}
            </span>
          </>
        )}
      </nav>

      {/* Identity, verdict, and the thing to actually do about it all live
          in one zone whose color/weight scales with real urgency — not a
          small pill next to an otherwise-neutral page. Browsing a past day
          stays neutral regardless of that day's own stage; only the
          vehicle's CURRENT state earns the tint. */}
      <div id="selected-inspection" className={`scroll-mt-4 rounded-lg border p-3 ${zoneTone}`}>
        {/* Same bordered-grid look as the checklist table below, so the
            vehicle's identity/status/location reads like one consistent
            spreadsheet instead of a different freeform style up top. Every
            clickable cell gets the same hover tint as a real spreadsheet
            cell highlighting under the pointer. */}
        <div className="overflow-hidden rounded-sm border border-gray-300 text-sm">
          {/* Title column (status light + make/color) gets noticeably more
              room than type/FL# — those are short, fixed-shape strings
              ("Stand Up", "S-DOO-0116") that were leaving the title
              cramped enough to wrap onto two lines while they sat on
              mostly empty space. */}
          <div className="grid grid-cols-[minmax(64px,2.3fr)_minmax(100px,0.5fr)_minmax(114px,1.1fr)]">
            {/* Three separate cells, not one merged with "·" — matching the
                same one-field-per-column shape every other row in this grid
                already uses. All three are flex/items-center now so their
                text sits on the same baseline despite the title being a
                bigger, bolder font than its neighbors. Type/FL# get real
                pixel floors (sized to the longest real value in each field
                — "Pallet Jack", "S-DOO-0137") so they never truncate with
                room to spare; make/color's own floor is deliberately small
                (just icon + a couple characters) because it's the one
                field allowed to ellipsize — on the smallest real phone
                widths (375px ≈ a 331px box), even "Pallet Jack" + an FL#
                alone leave no room left for "Mint Mitsubishi" in full, so
                make/color is the field that gives first. A floor here big
                enough to always fit it too would force the whole grid
                wider than that box, clipping unrelated rows below (like
                "Last Inspected") the way plain fr tracks originally did. */}
            <span className="flex items-center gap-2 truncate border-r border-b border-gray-300 px-1.5 py-1.5 text-base font-bold whitespace-nowrap text-gray-900">
              <StatusDot stage={stage} size="sm" />
              <span className="truncate">{equipment.makeColor}</span>
            </span>
            <span className="flex items-center truncate border-r border-b border-gray-300 px-1.5 py-1.5 text-gray-700">
              {equipmentTypeLabel(equipment.type)}
            </span>
            <span className="flex items-center truncate border-b border-gray-300 px-1.5 py-1.5 whitespace-nowrap text-gray-700">
              {equipment.flNumber}
            </span>

            {isBrowsingHistory ? (
              // This vehicle's CURRENT status was otherwise fully hidden
              // while browsing a specific day — a manager who lands here
              // straight from a link (a Weekly Report cell, a History row)
              // for an already-confirmed day never saw the vehicle overall
              // still has a separate, untouched open issue elsewhere. That
              // gap is exactly how MIT-2304 stayed red for two weeks
              // unnoticed after its Aug 10 report was confirmed: the Aug 7
              // report was open the whole time, but nothing on this page
              // said so unless you happened to land on the Home view.
              openIssue && (
                <Link
                  href={`/dashboard/equipment/${serial}?date=${openIssue.inspection.date}&shift=${openIssue.inspection.shift}#selected-inspection`}
                  className={`col-span-3 border-b border-gray-200 px-2 py-1.5 font-semibold transition-colors duration-100 hover:bg-gray-50 hover:underline ${verdict.text}`}
                >
                  Click to review the inspection from {shortDate(openIssue.inspection.date)}
                  {openIssues.length > 1 ? ` (+${openIssues.length - 1} more)` : ""} →
                </Link>
              )
            ) : openIssue ? (
              <>
                {/* The link itself is the one-click path to the flagged
                    inspection — no need to also embed the whole
                    questionnaire here just to keep that reachable in one
                    tap. */}
                <Link
                  href={`/dashboard/equipment/${serial}?date=${openIssue.inspection.date}&shift=${openIssue.inspection.shift}#selected-inspection`}
                  className={`col-span-3 border-b border-gray-200 px-2 py-1.5 font-semibold transition-colors duration-100 hover:bg-gray-50 hover:underline ${verdict.text}`}
                >
                  Click to review the inspection from {shortDate(openIssue.inspection.date)}
                  {openIssues.length > 1 ? ` (1 of ${openIssues.length})` : ""} →
                </Link>
                {/* Confirming the issue above never touches these — they're
                    separate inspections that each need their own sign-off.
                    Named explicitly so a manager can't mistake "cleared the
                    top one" for "vehicle is clear." */}
                {openIssues.slice(1).map((issue) => (
                  <Link
                    key={issue.inspection.id}
                    href={`/dashboard/equipment/${serial}?date=${issue.inspection.date}&shift=${issue.inspection.shift}#selected-inspection`}
                    className="col-span-3 border-b border-gray-200 px-2 py-1 text-xs font-medium text-gray-500 transition-colors duration-100 hover:bg-gray-50 hover:underline"
                  >
                    Also review the inspection from {shortDate(issue.inspection.date)} ({issue.inspection.shift}) →
                  </Link>
                ))}
              </>
            ) : null /* Nothing open (All Clear / No Inspections Yet) — no
                        badge here at all now. Both of those already get
                        their own plain-language message below the grid
                        ("All caught up…" / "No inspections yet…"), so a
                        pill up here just repeated the same fact a second
                        time for the common case, when it should only show
                        up when there's actually something to flag. */}

            <span className="border-r border-b border-gray-200 px-2 py-1.5 text-gray-600 transition-colors duration-100 hover:bg-gray-50">
              {/* Where it is matters more day-to-day than its serial
                  number — leads with location, serial is the
                  secondary/lookup detail. */}
              <LocationChangeControl
                serial={equipment.serial}
                currentLocation={equipment.location}
                savedManagerName={savedManagerName}
              />
            </span>
            <span className="col-span-2 border-b border-gray-200 px-2 py-1.5 text-gray-600">
              Serial#: {equipment.serial}
            </span>

            {addedAt && addedAt > EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT && (
              <span className="col-span-3 border-b border-gray-200 px-2 py-1 text-xs text-gray-400">
                Added {addedAt.toISOString().slice(0, 10)}
              </span>
            )}

            {latest ? (
              <>
                {/* "Last inspected" is always a full-width row (col-span-3
                    at every viewport, not just mobile) — it just stretches
                    wider as the box grows, with "18d passed" pushed to the
                    far right edge, rather than being restructured into a
                    column-1-only layout at wider widths. Shift + inspector
                    stay together as their own row below, never split apart
                    into two separate stacked rows. */}
                <Link
                  href={`/dashboard/equipment/${serial}?date=${latest.inspection.date}&shift=${latest.inspection.shift}#selected-inspection`}
                  className="col-span-3 flex min-w-0 items-center justify-between gap-2 border-b border-gray-200 px-2 py-1.5 text-gray-600 transition-colors duration-100 hover:bg-gray-50 hover:text-brand hover:underline"
                >
                  <span className="min-w-0 truncate">Last inspected: {latest.inspection.date}</span>
                  {since && (
                    <span className="animate-[status-blink_3s_ease-in-out_infinite] shrink-0 text-xs font-semibold text-red-600">
                      {daysPassed}d passed
                    </span>
                  )}
                </Link>
                {/* An actual cell border divides these now, not a "/"
                    character in the middle of one shared cell. */}
                <span className="border-r border-gray-200 px-2 py-1.5 text-gray-600">
                  {latest.inspection.shift} Shift
                </span>
                <span className="px-2 py-1.5 whitespace-nowrap text-gray-600">
                  Inspected By: {latest.inspection.firstName} {latest.inspection.lastName}
                </span>
              </>
            ) : (
              <span className="col-span-3 px-2 py-1.5 text-gray-500">No inspection yet</span>
            )}
          </div>
        </div>

        {selectedRows.length > 0 ? (
          selectedRows.map((row) => (
            <InspectionReviewForm
              key={row.inspection.id}
              row={row}
              savedManagerName={savedManagerName}
              todayDisplay={todayDisplay}
              // A day can hold both a Day and a Night inspection — when it
              // does, each form needs its own shift label so the two don't
              // read as one confusing merged form.
              showShiftLabel={selectedRows.length > 1}
            />
          ))
        ) : highlightDate ? (
          <p className="mt-4 border-t border-black/5 pt-4 text-center text-sm text-gray-500">
            No inspection found for {highlightDate}.
          </p>
        ) : openIssue ? null : ( // the badge above is already the call to action
          <p
            className={`mt-4 border-t border-black/5 pt-4 text-center text-sm font-medium ${
              latest ? "text-green-800" : "text-gray-500"
            }`}
          >
            {latest ? "✓ All caught up" : "No inspections yet — this vehicle hasn't been checked in."}
          </p>
        )}
      </div>

      <div className="mt-6">
        <VehicleHistory serial={serial} todayKey={today} entries={logEntries} />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
        <ExportOptions exportPath={`/dashboard/export/${equipment.serial}`} showScope={false} />
        <a href="/dashboard/manage" className="font-medium hover:text-gray-600 hover:underline">
          Manage this vehicle →
        </a>
      </div>
    </main>
  )
}

function InspectionReviewForm({
  row,
  savedManagerName,
  todayDisplay,
  showShiftLabel,
}: {
  row: InspectionRow
  savedManagerName: string
  todayDisplay: string
  showShiftLabel: boolean
}) {
  // Once a supervisor has signed and confirmed this specific inspection
  // (stage "confirmed"), every flagged item's Complete toggle becomes
  // permanent — that signature is a real record of it being fixed, and it
  // must never be silently reopened by an accidental tap afterward.
  const isLocked = row.stage === "confirmed"

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      {showShiftLabel && (
        <p className="mb-2 text-sm font-bold tracking-wide text-gray-400 uppercase">
          {row.inspection.shift} Shift · {row.inspection.firstName} {row.inspection.lastName}
        </p>
      )}
      {row.stage === "pending-confirm" &&
        !row.flagged.every((q) => row.review.issueStatus[q.id] === "complete") && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Mark every flagged item below <strong>Complete</strong>, then submit below to confirm
            all clear.
          </div>
        )}

      <form action={saveActivity} className="space-y-4">
        <input type="hidden" name="inspectionId" value={row.inspection.id} />

        <div className="overflow-hidden rounded-sm border border-gray-300 text-sm">
        {/* Same measured-pixel-floor approach as the vehicle info box
            above, sized against real device widths (a 360px phone gives
            this table ~316px, a 375px phone ~331px): Answer's floor
            covers "Working condition" on one line — that's the one
            column that must never wrap, so its floor is a real content
            measurement, not a guess. Status is fixed (not auto, which
            visibly jumped the column narrower the instant "Tap to Fix"
            (10 chars) got hidden in favor of "Fixed" (5 chars) in a
            checked row). Item's own floor is deliberately smaller than
            Answer's — giving it an equal floor would push their combined
            minimum past that ~316-331px box, forcing the whole table
            wider than its container the same way the vehicle info box
            blew out above. Item is the column that's allowed to wrap
            (the two genuinely longest labels, "Forward & Backward
            Movement" and "Lift/Lowering Movement", still wrap to a
            second line when space is tight — expected, and the wrap now
            indents under the label instead of back under the number),
            so it doesn't need a no-wrap guarantee the way Answer does.
            `min-w-0` on both the cell and the label span keeps a long
            single word ("Battery", "Lowering") from silently overflowing
            past its own cell into the next one — where it would render
            invisibly, hidden behind that cell's opaque background
            instead of visibly wrapping; `break-words` is the last-resort
            backstop on the rare word that's still too wide even for its
            own line at the smallest supported width. */}
        <div className="grid grid-cols-[minmax(90px,auto)_minmax(9rem,1fr)_5rem]">
          <span className="border-r border-b border-gray-300 bg-gray-100 px-2 py-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Item
          </span>
          <span className="border-r border-b border-gray-300 bg-gray-100 px-2 py-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Answer
          </span>
          <span className="border-b border-gray-300 bg-gray-100 px-2 py-1.5 text-center text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Status
          </span>
          {(isCriticalInspection(row.inspection) ? [REPAIR_REQUEST_QUESTION] : QUESTIONS).map(
            (q, i) => {
              const answer = row.answers[q.id]
              if (!answer) return null
              const isRepairRequest = q.id === REPAIR_REQUEST_ISSUE_ID
              const bad = needsAttention(answer.value)
              const critical = bad && isCriticalFlag(row.inspection, q.id)
              const status = row.review.issueStatus[q.id]
              const fixed = bad && status === "complete"
              const textColor = fixed
                ? "text-gray-500"
                : critical
                  ? "text-red-700"
                  : bad
                    ? "text-amber-700"
                    : "text-gray-700"
              // Alternating row shading + full cell borders on every side —
              // the spreadsheet look this was asked for, instead of a plain
              // list with just a line under each row.
              const rowBg = i % 2 === 1 ? "bg-gray-50" : "bg-white"
              const cellBorder = "border-r border-b border-gray-200"
              return (
                <Fragment key={q.id}>
                  {/* No more forced nowrap -- that's what was demanding so
                      much width that long labels ("Forward & Backward
                      Movement") got clipped by the table's own overflow-
                      hidden edge instead of just wrapping to a second line.
                      The number sits in its own shrink-0 flex item so a
                      wrapped second line indents under the label text, not
                      back under the number. */}
                  <span className={`flex min-w-0 gap-1 px-2 py-1.5 font-semibold ${textColor} ${rowBg} ${cellBorder}`}>
                    {isRepairRequest ? (
                      "Repair Request"
                    ) : (
                      <>
                        <span className="shrink-0">{q.number}.</span>
                        <span className="min-w-0 break-words">{q.label}</span>
                      </>
                    )}
                  </span>
                  <span className={`px-2 py-1.5 ${textColor} ${rowBg} ${cellBorder}`}>
                    {(() => {
                      const hasPhotos = Boolean(answer.photos && answer.photos.length > 0)
                      const hasNoteOrPhotos = Boolean(answer.note) || hasPhotos
                      const specifyLine = !isRepairRequest && answer.specify && (
                        <span className="block text-xs text-gray-500">{answer.specify}</span>
                      )
                      // No more permanent "Note: …" row underneath every
                      // flagged item — that's back to a plain <details>
                      // disclosure right on the answer, so the note/photos
                      // only take up space once someone actually taps to
                      // open them. The camera icon (same one used on the
                      // fleet list) still shows up front so a photo's
                      // presence is visible without opening anything.
                      if (!hasNoteOrPhotos) {
                        return (
                          <>
                            {isRepairRequest ? "" : answer.value}
                            {specifyLine}
                          </>
                        )
                      }
                      return (
                        <details>
                          <summary className="flex cursor-pointer list-none items-center gap-1 marker:hidden">
                            {isRepairRequest ? "Reported" : answer.value}
                            {hasPhotos && (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-3.5 w-3.5 shrink-0 text-gray-400"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M1 8a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 018.07 3h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0016.07 6H17a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V8zm13.5 3a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </summary>
                          {specifyLine}
                          {answer.note && (
                            <p className="mt-1 text-xs text-gray-500">
                              {isRepairRequest ? "" : "Note: "}
                              {answer.note}
                            </p>
                          )}
                          {answer.photos && answer.photos.length > 0 && (
                            <div className="mt-1">
                              <PhotoGallery photos={answer.photos} notes={answer.photoNotes} />
                            </div>
                          )}
                        </details>
                      )
                    })()}
                  </span>
                  <span className={`flex items-center justify-center px-1 py-1.5 ${rowBg} border-b border-gray-200`}>
                    {bad &&
                      (isLocked ? (
                        // Signed and confirmed — permanent. Plain text, not
                        // a control: no cursor, no hover state, nothing to
                        // click. The hidden input still submits "complete"
                        // so re-saving a note here (if that ever happens)
                        // can't accidentally flip this back open.
                        <span
                          title="Confirmed by supervisor signature — permanent, can't be reopened"
                          className="text-[10px] font-bold tracking-wide text-green-700 uppercase"
                        >
                          <input type="hidden" name={`issue_${q.id}`} value="complete" />
                          Fixed
                        </span>
                      ) : (
                        // No icon — the text itself is the whole control,
                        // and its own wording swaps from an instruction to
                        // a confirmation the instant it's checked.
                        <label
                          title={
                            status === "complete"
                              ? "Marked fixed — click to reopen"
                              : "Click to mark fixed"
                          }
                          className="flex h-full w-full cursor-pointer items-center justify-center rounded px-1 py-1 text-center transition-colors duration-100 active:scale-95"
                        >
                          <input
                            type="checkbox"
                            name={`issue_${q.id}`}
                            value="complete"
                            defaultChecked={status === "complete"}
                            className="peer sr-only"
                          />
                          <span className="animate-pulse text-[10px] font-bold tracking-wide text-amber-600 uppercase peer-checked:hidden">
                            Tap to Fix
                          </span>
                          <span className="hidden text-[10px] font-bold tracking-wide text-green-700 uppercase peer-checked:inline">
                            Fixed
                          </span>
                        </label>
                      ))}
                  </span>
                </Fragment>
              )
            }
          )}
        </div>
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="mb-3 text-sm font-semibold text-gray-900">Supervisor Review</p>
          <label className="mb-1 block text-sm font-medium text-gray-700">Note</label>
          <textarea
            name="noteText"
            placeholder="What did you check or change?"
            rows={2}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base"
          />

          <div className="mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Supervisor Signature
                </label>
                <input
                  type="text"
                  name="reviewerName"
                  defaultValue={savedManagerName}
                  placeholder="Name of the supervisor"
                  required
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                <p className="rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-600">
                  {todayDisplay}
                </p>
              </div>
            </div>
            <SignConfirmButton />
          </div>
        </div>

        {row.review.activity.length > 0 && (
          <div className="border-t border-gray-100 pt-2.5">
            <p className="mb-1.5 text-xs font-semibold text-gray-500">Activity</p>
            <ul className="space-y-1.5">
              {[...row.review.activity].reverse().map((entry) => (
                <li key={entry.id} className="text-xs text-gray-600">
                  <ActivityLine entry={entry} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </div>
  )
}

function ActivityLine({ entry }: { entry: ActivityEntry }) {
  const when = new Date(entry.timestamp).toLocaleString()

  if (entry.type === "confirmed") {
    return (
      <>
        🟢 Confirmed all clear by{" "}
        <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  if (entry.type === "viewed") {
    return (
      <>
        ✓ Reviewed by <span className="font-medium text-gray-800">{entry.authorName}</span> —{" "}
        {when}
      </>
    )
  }

  if (entry.type === "location") {
    return (
      <>
        📍 Location set to{" "}
        <span className="font-medium text-gray-800">{entry.location}</span> by{" "}
        <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  if (entry.type === "issue") {
    const q = QUESTIONS_BY_ID[entry.questionId]
    const label = entry.status === "complete" ? "Complete" : "In Review"
    return (
      <>
        <span className={entry.status === "complete" ? "text-brand" : "text-amber-700"}>
          {q?.label ?? entry.questionId} marked {label}
        </span>{" "}
        by <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  return (
    <>
      <span className="font-medium text-gray-800">{entry.authorName}</span>: {entry.text} —{" "}
      {when}
    </>
  )
}
