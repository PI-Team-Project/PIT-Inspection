import Link from "next/link"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { QUESTIONS, QUESTIONS_BY_ID, needsAttention } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"
import { parseReview, getStage, type ActivityEntry, type Stage } from "@/lib/review"
import {
  DASHBOARD_COOKIE,
  MANAGER_NAME_COOKIE,
  dashboardSessionValue,
} from "@/lib/auth"
import PinForm from "./PinForm"
import HomeLink from "./HomeLink"
import { lockDashboard, saveActivity, confirmResolved } from "./actions"

type Answers = Record<string, { value: string; specify?: string }>

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; filter?: string }>
}) {
  const params = await searchParams
  const cookieStore = await cookies()
  const authed = cookieStore.get(DASHBOARD_COOKIE)?.value === dashboardSessionValue()

  if (!authed) {
    return <PinForm error={params.error === "1"} />
  }

  const onlyIssues = params.filter === "issues"
  const savedManagerName = cookieStore.get(MANAGER_NAME_COOKIE)?.value ?? ""

  const allInspections = await prisma.inspection.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const withFlags = allInspections.map((inspection) => {
    const answers = inspection.answers as Answers
    const review = parseReview(inspection.review)
    const flagged = QUESTIONS.filter((q) =>
      needsAttention(answers[q.id]?.value ?? "")
    )
    const unresolved = flagged.filter((q) => review.issueStatus[q.id] !== "complete")
    const stage = getStage(flagged.length, unresolved.length, review.confirmedResolved)
    return { inspection, answers, review, flagged, unresolved, stage }
  })

  const rows = onlyIssues
    ? withFlags.filter((row) => row.unresolved.length > 0)
    : withFlags

  const latestByEquipment = new Map<string, (typeof withFlags)[number]>()
  for (const row of withFlags) {
    if (!latestByEquipment.has(row.inspection.equipmentSerial)) {
      latestByEquipment.set(row.inspection.equipmentSerial, row)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <HomeLink />
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
            Inspection Dashboard
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={onlyIssues ? "/dashboard" : "/dashboard?filter=issues"}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-transform duration-100 active:scale-95 active:bg-gray-100"
          >
            {onlyIssues ? "Show all" : "Show only issues"}
          </Link>
          <a
            href="/dashboard/export"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-transform duration-100 active:scale-95 active:bg-gray-100"
          >
            Export CSV
          </a>
          <form action={lockDashboard}>
            <button
              type="submit"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-transform duration-100 active:scale-95 active:bg-gray-100"
            >
              Lock
            </button>
          </form>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">
          Equipment Status
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {EQUIPMENT_LIST.map((eq) => {
            const latest = latestByEquipment.get(eq.serial)
            const stage = latest?.stage
            const style =
              stage === "unresolved"
                ? "border-red-300 bg-red-50"
                : stage === "pending-confirm"
                  ? "border-amber-300 bg-amber-50"
                  : stage === "confirmed" || stage === "clean"
                    ? "border-green-300 bg-green-50"
                    : "border-gray-200 bg-gray-50"
            return (
              <div
                key={eq.serial}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${style}`}
              >
                <span className="font-medium text-gray-800">{eq.label}</span>
                {stage === "unresolved" ? (
                  <span className="font-semibold text-red-700">Not Safe</span>
                ) : stage === "pending-confirm" ? (
                  <span className="font-semibold text-amber-700">Fixed — pending confirm</span>
                ) : stage === "confirmed" ? (
                  <span className="font-semibold text-green-700">
                    Safe <span className="font-normal text-green-600">(resolved issue)</span>
                  </span>
                ) : stage === "clean" ? (
                  <span className="font-semibold text-green-700">Safe</span>
                ) : (
                  <span className="text-gray-500">No inspection yet</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="mt-6 mb-3 text-sm text-gray-600">
        Most recent submissions first.
      </p>

      {rows.length === 0 && (
        <p className="text-gray-500">
          {onlyIssues ? "No unresolved issues right now." : "No inspections submitted yet."}
        </p>
      )}

      <div className="space-y-3">
        {rows.map(({ inspection, answers, review, unresolved, stage }) => (
          <details
            key={inspection.id}
            className="rounded-lg border border-gray-300 bg-white p-4"
          >
            <summary className="-m-4 flex cursor-pointer items-start justify-between gap-3 rounded-lg p-4 transition-colors duration-100 active:bg-gray-50">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {inspection.firstName} {inspection.lastName}
                </p>
                <p className="text-sm text-gray-600">
                  {inspection.date} · {inspection.equipmentLabel}
                </p>
              </div>
              <StageBadge stage={stage} unresolvedCount={unresolved.length} />
            </summary>

            {stage === "pending-confirm" && (
              <form
                action={confirmResolved}
                className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3"
              >
                <input type="hidden" name="inspectionId" value={inspection.id} />
                <input
                  type="text"
                  name="reviewerName"
                  defaultValue={savedManagerName}
                  placeholder="Supervisor name"
                  required
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-amber-700"
                >
                  ✓ Confirm All Clear
                </button>
              </form>
            )}

            <form
              action={saveActivity}
              className="mt-4 space-y-2.5 border-t border-gray-200 pt-4"
            >
              <input type="hidden" name="inspectionId" value={inspection.id} />

              <p className="text-sm text-gray-600">
                Serial#: {inspection.equipmentSerial}
              </p>

              {QUESTIONS.map((q) => {
                const answer = answers[q.id]
                if (!answer) return null
                const bad = needsAttention(answer.value)
                const status = review.issueStatus[q.id]
                const fixed = bad && status === "complete"
                return (
                  <div
                    key={q.id}
                    className={bad ? "space-y-1.5" : ""}
                  >
                    <div
                      className={`text-sm ${
                        fixed ? "text-gray-500" : bad ? "text-red-700" : "text-gray-700"
                      }`}
                    >
                      <span className="font-semibold">
                        {q.number}. {q.label}:
                      </span>{" "}
                      {answer.value}
                      {answer.specify ? ` — ${answer.specify}` : ""}
                    </div>
                    {bad && (
                      <div className="flex gap-2">
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-amber-700 has-checked:border-amber-500 has-checked:bg-amber-50">
                          <input
                            type="radio"
                            name={`issue_${q.id}`}
                            value="in_review"
                            required
                            defaultChecked={status === "in_review"}
                            className="h-3.5 w-3.5"
                          />
                          In Review
                        </label>
                        <label className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-semibold text-blue-700 has-checked:border-blue-500 has-checked:bg-blue-50">
                          <input
                            type="radio"
                            name={`issue_${q.id}`}
                            value="complete"
                            required
                            defaultChecked={status === "complete"}
                            className="h-3.5 w-3.5"
                          />
                          Complete
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Note (optional)
                </label>
                <textarea
                  name="noteText"
                  placeholder="What did you check or change?"
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Name of Supervisor
                </label>
                <input
                  type="text"
                  name="reviewerName"
                  defaultValue={savedManagerName}
                  placeholder="Supervisor name"
                  required
                  className="mb-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-base font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700"
                >
                  ✓ Confirm Review
                </button>
              </div>

              {review.activity.length > 0 && (
                <div className="border-t border-gray-100 pt-2.5">
                  <p className="mb-1.5 text-xs font-semibold text-gray-500">
                    Activity
                  </p>
                  <ul className="space-y-1.5">
                    {[...review.activity]
                      .reverse()
                      .map((entry) => (
                        <li key={entry.id} className="text-xs text-gray-600">
                          <ActivityLine entry={entry} />
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </form>
          </details>
        ))}
      </div>
    </main>
  )
}

function StageBadge({
  stage,
  unresolvedCount,
}: {
  stage: Stage
  unresolvedCount: number
}) {
  if (stage === "unresolved") {
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
        🔴 {unresolvedCount} unresolved
      </span>
    )
  }
  if (stage === "pending-confirm") {
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        🟡 Fixed — pending confirm
      </span>
    )
  }
  if (stage === "confirmed") {
    return (
      <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
        🟢 Resolved &amp; confirmed
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
      🟢 All good
    </span>
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
        ✓ Reviewed by{" "}
        <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  if (entry.type === "issue") {
    const q = QUESTIONS_BY_ID[entry.questionId]
    const label = entry.status === "complete" ? "Complete" : "In Review"
    return (
      <>
        <span className={entry.status === "complete" ? "text-blue-700" : "text-amber-700"}>
          {q?.label ?? entry.questionId} marked {label}
        </span>{" "}
        by <span className="font-medium text-gray-800">{entry.authorName}</span> — {when}
      </>
    )
  }

  return (
    <>
      <span className="font-medium text-gray-800">{entry.authorName}</span>: {entry.text}{" "}
      — {when}
    </>
  )
}
