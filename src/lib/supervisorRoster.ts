import { prisma } from "@/lib/prisma"
import { NO_NAME, OTHER_SUPERVISOR, normalizeSupervisorName } from "@/lib/supervisors"

// Server-only half of src/lib/supervisors.ts — kept apart so the client
// picker can import the constants without pulling Prisma into the bundle.

export async function getSupervisors(): Promise<string[]> {
  const rows = await prisma.supervisor.findMany({ orderBy: { createdAt: "asc" } })
  return rows.map((row) => row.name)
}

// Called by every action that records a supervisor's signature.
export async function recordSupervisor(raw: string): Promise<void> {
  const name = normalizeSupervisorName(raw)
  if (!name || name === NO_NAME || name === OTHER_SUPERVISOR) return
  await prisma.supervisor.upsert({ where: { name }, create: { name }, update: {} })
}
