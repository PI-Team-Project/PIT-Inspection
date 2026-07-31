import Link from "next/link"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { QUESTIONS, needsAttention } from "@/lib/questions"
import { EQUIPMENT_LIST } from "@/lib/equipment"
import { parseReview } from "@/lib/review"
import { DASHBOARD_COOKIE, dashboardSessionValue } from "@/lib/auth"
import PinForm from "./PinForm"
import HomeLink from "./HomeLink"
import { lockDashboard, saveReview } from "./actions"

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
    const unresolved = flagged.filter((q) => !review.issueStatus[q.id])
    return { inspection, answers, review, flagged, unresolved }
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
            const unsafe = (latest?.unresolved.length ?? 0) > 0
            return (
              <div
                key={eq.serial}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                  unsafe
                    ? "border-red-300 bg-red-50"
                    : latest
                      ? "border-green-300 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                }`}
              >
                <span className="font-medium text-gray-800">{eq.label}</span>
                {unsafe ? (
                  <span className="font-semibold text-red-700">Not Safe</span>
                ) : latest ? (
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
        {rows.map(({ inspection, answers, review, flagged, unresolved }) => (
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
              {unresolved.length > 0 ? (
                <span className="shrink-0 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                  {unresolved.length} unresolved
                </span>
              ) : flagged.length > 0 ? (
                <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                  Resolved
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                  All good
                </span>
              )}
            </summary>

            <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
              <p className="text-sm text-gray-600">
                Serial#: {inspection.equipmentSerial}
              </p>
              {QUESTIONS.map((q) => {
                const answer = answers[q.id]
                if (!answer) return null
                const bad = needsAttention(answer.value)
                const fixed = bad && review.issueStatus[q.id]
                return (
                  <div
                    key={q.id}
                    className={`text-sm ${
                      fixed
                        ? "text-gray-500"
                        : bad
                          ? "text-red-700"
                          : "text-gray-700"
                    }`}
                  >
                    <span className="font-medium">
                      {q.number}. {q.label}:
                    </span>{" "}
                    {answer.value}
                    {answer.specify ? ` — ${answer.specify}` : ""}
                    {fixed ? " (fixed)" : ""}
                  </div>
                )
              })}
            </div>

            <form
              action={saveReview}
              className="mt-4 space-y-3 border-t border-gray-200 pt-4"
            >
              <input type="hidden" name="inspectionId" value={inspection.id} />

              {flagged.length > 0 && (
                <>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      name="acknowledged"
                      defaultChecked={review.acknowledged}
                      className="h-4 w-4"
                    />
                    Reviewed by manager
                  </label>

                  <div className="space-y-2">
                    {flagged.map((q) => (
                      <label
                        key={q.id}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          name={`issue_${q.id}`}
                          defaultChecked={review.issueStatus[q.id] ?? false}
                          className="h-4 w-4"
                        />
                        Fixed: {q.number}. {q.label}
                      </label>
                    ))}
                  </div>
                </>
              )}

              <textarea
                name="notes"
                defaultValue={review.notes}
                placeholder="Notes"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />

              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-blue-700"
              >
                Save
              </button>
            </form>
          </details>
        ))}
      </div>
    </main>
  )
}
