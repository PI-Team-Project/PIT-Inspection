import { Fragment } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { resolvePhotoSources } from "@/lib/photoStorage"
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
import PendingLocationApproval from "../../PendingLocationApproval"
import SignConfirmButton from "../../SignConfirmButton"
import { saveActivity } from "../../actions"
import VehicleHistory, { type LogEntry } from "./VehicleHistory"
import ExportOptions from "../../ExportOptions"

// A date KEY ("2026-08-07") has no time zone of its own — formatting as UTC
// (not the server's local zone) guarantees the digits shown always match
// the digits in the key, with no drift. Used for the short, readable dates
// in the "click to review" sentences below (e.g. "Aug 7").
// How many of the *other* open issues get their own chip before the rest
// collapse into a "+N more" pointing at the History list. Six fits one line
// on a phone and two at most on desktop, which keeps this row from ever
// becoming the tallest thing on the page again.
const MAX_OTHER_OPEN_ISSUES = 6

// A bare "Sep 15" can't distinguish an issue open for twelve days from one
// open for twelve months, and a vehicle nobody signs off on carries both.
// The year appears only when it isn't the current one, so recent dates stay
// as short as they were.
function shortDateWithYear(dateKey: string, todayKey: string): string {
  const year = dateKey.slice(0, 4)
  return year === todayKey.slice(0, 4) ? shortDate(dateKey) : `${shortDate(dateKey)}, ${year}`
}

function shortDate(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

// Same UTC-anchored formatting as shortDate, with weekday and year added —
// this sits directly above one specific inspection's own answers, so it has
// to read unambiguously on its own. Without it, the only date on the page
// was the vehicle's overall "Last inspected" date up in the status box —
// which is very often a different, more recent date than the one actually
// selected — leaving no clear answer to "which day's questionnaire am I
// looking at right now."
// Two separate inspections landing on the same day/shift (a genuine
// double-submission, or stale test data) are one and the same task for a
// supervisor to go review — without this, each one earned its own "Also
// review the inspection from Aug 14 (Day)" line, so the same date could
// repeat many times over for what's really a single day's problem. Keeps
// the first (worst/oldest — findAllOpenIssues already sorted that way) of
// each date+shift group, same order otherwise.
function dedupeByDateShift<T extends { inspection: { date: string; shift: string } }>(
  rows: T[]
): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    const key = `${row.inspection.date}|${row.inspection.shift}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dateHeading(dateKey: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00Z`))
}

// For an actual moment in time (not a date key) — a pending location
// report's timestamp, so a supervisor can tell "just now" from "three days
// ago" while deciding whether to approve it.
function shortDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: FLEET_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)
}

export default async function EquipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ serial: string }>
  searchParams: Promise<{ date?: string; shift?: string; view?: string }>
}) {
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()
  if (!authed) {
    redirect("/dashboard")
  }

  const { serial } = await params
  const { date: highlightDate, shift: highlightShift, view: viewParam } = await searchParams
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
  const openIssues = dedupeByDateShift(findAllOpenIssues(allHistory))
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

  // Open issues on some OTHER day than the one on screen. A link into a date
  // shows every inspection from that date (both shifts — see above), so any
  // open issue sharing the viewed date is already visible and must not be
  // offered as somewhere to go: the banner used to point at openIssues[0]
  // unconditionally, so after clicking through to the oldest open issue the
  // banner still invited you to that same date and clicking it did nothing
  // at all. Filtering by date rather than date+shift is deliberate for the
  // same reason.
  const openIssuesElsewhere = highlightDate
    ? openIssues.filter((issue) => issue.inspection.date !== highlightDate)
    : openIssues

  const selectedInspections = matchingIds.length
    ? await prisma.inspection.findMany({ where: { id: { in: matchingIds } }, include: { photos: true } })
    : []
  // Photo bytes live in object storage now, so what the browser loads is a
  // signed URL minted here — one signing call covering every photo on the
  // page. Rows written before the move still carry inline data URIs and
  // resolve to those instead, which is what keeps the pre-wipe backup
  // readable. This is the only page that renders photo bytes at all.
  const resolvedPhotos = await resolvePhotoSources(
    selectedInspections.flatMap((inspection) => inspection.photos)
  )
  const photosByInspection = new Map<string, typeof resolvedPhotos>()
  for (const photo of resolvedPhotos) {
    const list = photosByInspection.get(photo.inspectionId)
    if (list) list.push(photo)
    else photosByInspection.set(photo.inspectionId, [photo])
  }
  const resolvedInspections = selectedInspections.map((inspection) => ({
    ...inspection,
    photos: photosByInspection.get(inspection.id) ?? [],
  }))

  // Refetched rows can come back in any order — matchingIds already carries
  // the Day-before-Night order decided above, so re-derive from that.
  const selectedRows: InspectionRow[] = matchingIds
    .map((id) => resolvedInspections.find((i) => i.id === id))
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
          {/* Widths come from the content, not from measured pixel floors.
              Type and FL# are `auto`, so each takes exactly what its own
              text needs on that device — "Stand Up" asks for less than
              "Pallet Jack", and neither reserves space it is not using. The
              title takes everything left over.

              The floors this replaces (64/100/114px) were measured against
              one phone, so they only held on that phone: at 390px they left
              the title 2px short of "Jungheinrich" and 14px short of "Red
              Mitsubishi", while Type sat on 26px of unused space and FL# on
              35px. Any new device width, or any longer vehicle name, broke
              them again — and there is no width at which a fixed floor is
              right for every screen from a 320px phone to a desktop.

              minmax(0,1fr) rather than 1fr so the title can still give way
              below the width where all three genuinely fit (~355px); it
              truncates there instead of pushing the table wider than its
              container. Nothing about the layout changes with screen size —
              same three columns, same order, same look — only how the
              spare space is divided. */}
          {/* Its own grid, deliberately. These three share a row with
              nothing, so their widths can be decided by their own content:
              Type and FL# take exactly what their text needs on the device
              in hand, and the title takes whatever is left. While they were
              part of the grid below, the "Serial#" cell two rows down spans
              two of these columns, and CSS grid widens a spanning item's
              tracks to fit it — so "Stand Up" was handed 148px to display
              71px of text, starving the title on every phone.

              This replaces measured pixel floors (64/100/114px) that only
              held on the one device they were measured against: at 390px
              they left the title 2px short of "Jungheinrich" and 14px short
              of "Red Mitsubishi". There is no fixed floor that is right for
              every screen from a 320px phone to a desktop, so none is used.

              minmax(0,1fr) lets the title still give way below the width
              where all three genuinely fit, truncating rather than pushing
              the table wider than its container. The layout itself never
              changes shape — same three columns, same order, same look on
              every device; only the spare space moves. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] border-b border-gray-300">
            <span className="flex min-w-0 items-center gap-2 border-r border-gray-300 px-1.5 py-1.5 text-base font-bold text-gray-900">
              <StatusDot stage={stage} size="sm" />
              {/* Wraps rather than truncates. On anything from a 375px
                  phone up it never needs to — the name fits on one line.
                  Below that the three values genuinely cannot share a row,
                  and a second line keeps "Mint Mitsubishi" readable where
                  an ellipsis hid half of it. Wrapping was removed here once
                  before, when the neighbouring columns hoarded width and
                  forced it to wrap on screens where it should have fitted;
                  now they take only what they need, so this only ever
                  triggers under real pressure. */}
              <span className="min-w-0 break-words">{equipment.makeColor}</span>
            </span>
            <span className="flex items-center border-r border-gray-300 px-1.5 py-1.5 whitespace-nowrap text-gray-700">
              {equipmentTypeLabel(equipment.type)}
            </span>
            <span className="flex items-center px-1.5 py-1.5 whitespace-nowrap text-gray-700">
              {equipment.flNumber}
            </span>
          </div>

          {/* Two columns, not three: every row here is either a label and its
              value, or full width. The third track only ever existed to
              line up with the identity row above, which now sizes itself —
              and keeping it meant "Inspected By: Sam Farrow" was handed
              41px to render 181px of text. `auto` on the label column takes
              what the longest label needs and no more. */}
          <div className="grid grid-cols-[auto_minmax(0,1fr)]">

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
              openIssuesElsewhere.length > 1 ? (
                // Several other days still open: go to the Issues Only list
                // and show them all at once. Walking to the next one, then
                // the next, is the wrong shape for 160 of them — a
                // supervisor wants the queue, not a tour of it.
                <Link
                  href={`/dashboard/equipment/${serial}?date=${highlightDate}${
                    highlightShift ? `&shift=${highlightShift}` : ""
                  }&view=issues#vehicle-history`}
                  scroll={false}
                  className={`col-span-2 border-b border-gray-200 px-2 py-1.5 font-semibold transition-colors duration-100 hover:bg-gray-50 hover:underline ${verdict.text}`}
                >
                  See all {openIssuesElsewhere.length} unresolved inspections
                </Link>
              ) : openIssuesElsewhere.length === 1 ? (
                // Exactly one: no list needed, link straight at it.
                <Link
                  href={`/dashboard/equipment/${serial}?date=${openIssuesElsewhere[0].inspection.date}&shift=${openIssuesElsewhere[0].inspection.shift}#selected-inspection`}
                  className={`col-span-2 border-b border-gray-200 px-2 py-1.5 font-semibold underline decoration-2 underline-offset-2 transition-colors duration-100 hover:bg-gray-50 ${verdict.text}`}
                >
                  Also unresolved: {shortDateWithYear(openIssuesElsewhere[0].inspection.date, today)} (
                  {openIssuesElsewhere[0].inspection.shift})
                </Link>
              ) : null
            ) : openIssue ? (
              <>
                {/* The link itself is the one-click path to the flagged
                    inspection — no need to also embed the whole
                    questionnaire here just to keep that reachable in one
                    tap. */}
                <Link
                  href={`/dashboard/equipment/${serial}?date=${openIssue.inspection.date}&shift=${openIssue.inspection.shift}#selected-inspection`}
                  className={`col-span-2 border-b border-gray-200 px-2 py-1.5 font-semibold underline decoration-2 underline-offset-2 transition-colors duration-100 hover:bg-gray-50 ${verdict.text}`}
                >
                  Review the inspection from{" "}
                  {shortDateWithYear(openIssue.inspection.date, today)}
                  {openIssues.length > 1 ? ` (1 of ${openIssues.length})` : ""}
                </Link>
                {/* Confirming the issue above never touches these — they're
                    separate inspections that each need their own sign-off,
                    so every one stays individually reachable and a manager
                    can't mistake "cleared the top one" for "vehicle is
                    clear."

                    They used to be one full-sentence row each ("Also review
                    the inspection from ..."), which was fine at two or
                    three and unusable past that: a vehicle carrying a year
                    of unconfirmed reports rendered 175 near-identical lines
                    and pushed the entire checklist off the screen. Dedupe by
                    date+shift doesn't help — every one of those IS a
                    distinct date+shift. So the sentence is said once and the
                    dates become chips, capped, with the remainder pointing
                    at the History list that already shows all of them. */}
                {openIssues.length > 1 && (
                  <div className="col-span-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-gray-200 px-2 py-1.5 text-xs">
                    <span className="font-medium text-gray-500">Also open:</span>
                    {openIssues.slice(1, 1 + MAX_OTHER_OPEN_ISSUES).map((issue) => (
                      <Link
                        key={issue.inspection.id}
                        href={`/dashboard/equipment/${serial}?date=${issue.inspection.date}&shift=${issue.inspection.shift}#selected-inspection`}
                        title={`Review the inspection from ${shortDateWithYear(issue.inspection.date, today)} (${issue.inspection.shift})`}
                        className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-medium whitespace-nowrap text-gray-600 transition-colors duration-100 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
                      >
                        {shortDateWithYear(issue.inspection.date, today)}
                        {/* One letter, not "(Night)" — at chip size the
                            full word doubles the width for a distinction
                            D/N already makes unambiguously. */}
                        <span className="ml-1 text-gray-400">
                          {issue.inspection.shift === "Night" ? "N" : "D"}
                        </span>
                      </Link>
                    ))}
                    {openIssues.length - 1 > MAX_OTHER_OPEN_ISSUES && (
                      <Link
                        href={`/dashboard/equipment/${serial}?view=issues#vehicle-history`}
                        scroll={false}
                        className="font-medium text-gray-500 underline underline-offset-2 hover:text-gray-800"
                      >
                        +{openIssues.length - 1 - MAX_OTHER_OPEN_ISSUES} more
                      </Link>
                    )}
                  </div>
                )}
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
            <span className="border-b border-gray-200 px-2 py-1.5 text-gray-600">
              Serial#: {equipment.serial}
            </span>

            {equipment.pendingLocation && equipment.pendingLocationReportedAt && (
              <PendingLocationApproval
                serial={equipment.serial}
                currentLocation={equipment.location}
                pendingLocation={equipment.pendingLocation}
                reportedBy={equipment.pendingLocationReportedBy ?? "Unknown"}
                reportedAtDisplay={shortDateTime(equipment.pendingLocationReportedAt)}
                savedManagerName={savedManagerName}
              />
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
                  className="col-span-2 flex min-w-0 items-center justify-between gap-2 border-b border-gray-200 px-2 py-1.5 text-gray-600 transition-colors duration-100 hover:bg-gray-50 hover:text-brand hover:underline"
                >
                  <span className="min-w-0 truncate">Last inspected: {latest.inspection.date}</span>
                  {since && (
                    <span className="animate-[status-blink_3s_ease-in-out_infinite] shrink-0 text-xs font-semibold text-red-600">
                      issue open {daysPassed}d
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
              <span className="col-span-2 px-2 py-1.5 text-gray-500">No inspection yet</span>
            )}

            {addedAt && addedAt > EQUIPMENT_ADDED_DATE_TRACKING_STARTS_AT && (
              <span className="col-span-2 border-t border-gray-200 px-2 py-1 text-xs text-gray-400">
                Added {addedAt.toISOString().slice(0, 10)}
              </span>
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

      {/* Anchor target for the open-issues row's "+N more" — scroll-mt
          matches #selected-inspection above so the heading isn't pinned
          under the top of the viewport on arrival. */}
      <div id="vehicle-history" className="mt-6 scroll-mt-4">
        <VehicleHistory
          serial={serial}
          todayKey={today}
          entries={logEntries}
          initialView={viewParam === "issues" ? "issues" : viewParam === "calendar" ? "calendar" : "log"}
        />
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
        <ExportOptions
          exportPath={`/dashboard/export/${equipment.serial}`}
          vehicleLabel={equipment.flNumber}
        />
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
}: {
  row: InspectionRow
  savedManagerName: string
  todayDisplay: string
}) {
  // Once a supervisor has signed and confirmed this specific inspection
  // (stage "confirmed"), every flagged item's Complete toggle becomes
  // permanent — that signature is a real record of it being fixed, and it
  // must never be silently reopened by an accidental tap afterward.
  const isLocked = row.stage === "confirmed"

  // The questions this inspection actually answered. A Repair Request
  // renders as a single row instead of the checklist, and its answer is
  // always flagged, so one never collapses — which is right, since a
  // repair report is the case you most need open.
  const shownQuestions = (
    isCriticalInspection(row.inspection) ? [REPAIR_REQUEST_QUESTION] : QUESTIONS
  ).filter((q) => row.answers[q.id])
  // The Status column only ever renders content for a flagged answer, so on
  // a clean inspection its header promised information that nine blank
  // cells then failed to deliver — and its fixed 5rem took a quarter of the
  // table's width on a phone to do it, which is what forced labels like
  // "Forward & Backward Movement" onto three lines.
  const anyFlagged = shownQuestions.some((q) => needsAttention(row.answers[q.id].value))
  // Collapse ONLY when every item is good. Any flag and the full table
  // stays open, which is exactly when a supervisor needs to see it. The
  // summary states the count rather than "No issues" so the number itself
  // is checkable against the checklist behind it.
  const allGood = shownQuestions.length > 0 && !anyFlagged

  // The review card is part of what a clean inspection hides: if there
  // is nothing to act on, the form to act with it does not need to be on
  // screen either. Extracted alongside the table so both can sit inside
  // the one disclosure.
  const reviewCard = (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
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
  )

  // Pulled out of the return so the clean case can wrap it in a
  // disclosure and the flagged case can render it bare, without the
  // whole 190-line table existing twice.
  const checklistTable = (
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
          <div
            className={`grid ${
              anyFlagged
                ? "grid-cols-[minmax(90px,auto)_minmax(9rem,1fr)_5rem]"
                : "grid-cols-[minmax(90px,auto)_minmax(9rem,1fr)]"
            }`}
          >
            <span className="border-r border-b border-gray-300 bg-gray-100 px-2 py-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Item
            </span>
            <span className="border-r border-b border-gray-300 bg-gray-100 px-2 py-1.5 text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Answer
            </span>
            {anyFlagged && (
              <span className="border-b border-gray-300 bg-gray-100 px-2 py-1.5 text-center text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Status
              </span>
            )}
            {shownQuestions.map(
              (q, i) => {
                const answer = row.answers[q.id]
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
                    {anyFlagged && (
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
                    )}
                  </Fragment>
                )
              }
            )}
          </div>
          </div>
  )

  return (
    <div className="mt-4 border-t border-black/5 pt-4">
      {/* Always shown, even when this is the only inspection on the page —
          previously this only appeared when a day held both a Day and a
          Night inspection, so the single-inspection case (the common one)
          had no date on the questionnaire itself at all, only the "Last
          inspected" date up in the status box above, which names the
          vehicle's overall latest inspection and is frequently a different
          day than the one actually selected. */}
      <p className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
        <span className="font-bold text-gray-900">{dateHeading(row.inspection.date)}</span>
        <span className="font-medium text-gray-500">
          {row.inspection.shift} Shift · {row.inspection.firstName} {row.inspection.lastName}
        </span>
      </p>
      {row.stage === "pending-confirm" &&
        !row.flagged.every((q) => row.review.issueStatus[q.id] === "complete") && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Mark every flagged item below <strong>Complete</strong>, then submit below to confirm
            all clear.
          </div>
        )}

      <form action={saveActivity} className="space-y-4">
        <input type="hidden" name="inspectionId" value={row.inspection.id} />

        {/* A clean inspection collapses to its conclusion. Nine rows
            reading "Good" deliver one bit of information — nothing to do
            here — while spending ~600px of scrolling on it, pushing
            Supervisor Review (the only actionable thing on the page)
            below the fold. Native <details>, so a server component needs
            no client JS, and safe inside the form because a clean row
            emits no inputs at all — only a flagged answer renders the
            issue_* checkbox — so nothing here can fail to submit while
            collapsed.

            Collapses only when EVERY item is good; one flag and the full
            table stays open, which is when it is actually needed. The
            summary names the count rather than "No issues", so the number
            is checkable against the checklist it hides. */}
        {allGood ? (
          <details className="group overflow-hidden rounded-sm border border-gray-300 text-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-green-50/60 px-3 py-2.5 transition-colors duration-100 hover:bg-green-50">
              <span className="flex items-center gap-1.5 font-semibold text-green-800">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                All {shownQuestions.length} items good
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-gray-500">
                <span className="group-open:hidden">View checklist</span>
                <span className="hidden group-open:inline">Hide checklist</span>
                <span
                  aria-hidden="true"
                  className="transition-transform duration-150 group-open:rotate-180"
                >
                  ⌄
                </span>
              </span>
            </summary>
            {checklistTable}
            <div className="border-t border-gray-300 p-3">{reviewCard}</div>
          </details>
        ) : (
          checklistTable
        )}

        {!allGood && <div className="mt-6">{reviewCard}</div>}


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
    const hasFrom = entry.fromLocation && entry.fromLocation !== entry.location
    return (
      <>
        📍 Location{" "}
        {hasFrom ? (
          <>
            changed from <span className="font-medium text-gray-800">{entry.fromLocation}</span> to{" "}
            <span className="font-medium text-gray-800">{entry.location}</span>
          </>
        ) : (
          <>
            set to <span className="font-medium text-gray-800">{entry.location}</span>
          </>
        )}{" "}
        by <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
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

  if (entry.type === "location-pending") {
    const hasFrom = entry.fromLocation && entry.fromLocation !== entry.location
    return (
      <>
        📍 <span className="font-medium text-gray-800">{entry.authorName}</span> reported
        {hasFrom ? (
          <>
            {" "}
            this may have moved from <span className="font-medium text-gray-800">{entry.fromLocation}</span>{" "}
            to <span className="font-medium text-gray-800">{entry.location}</span>
          </>
        ) : (
          <>
            {" "}
            location may be <span className="font-medium text-gray-800">{entry.location}</span>
          </>
        )}{" "}
        (pending approval) — {when}
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
