// Autosaves the in-progress inspection form to localStorage so a dropped
// connection or a backgrounded phone tab (both routine on a warehouse floor)
// doesn't wipe out a half-finished checklist. Photos are deliberately left
// out — File objects can't survive a reload, and browsers won't let a
// script repopulate a real <input type="file">, so there's no way to
// restore them even if we tried to persist the bytes.

export type InspectionDraft = {
  values: Record<string, string>
  step: number
  savedAt: string
}

const DRAFT_KEY = "pit-inspection-draft-v1"

export function saveInspectionDraft(draft: InspectionDraft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Quota exceeded or private browsing — losing the autosave is a soft
    // failure, not worth surfacing to someone mid-inspection.
  }
}

export function loadInspectionDraft(): InspectionDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as InspectionDraft
  } catch {
    return null
  }
}

export function clearInspectionDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}

// A brand-new form already seeds `values.date`, so a draft with nothing
// beyond that (and still on step 0) isn't worth prompting anyone to resume.
export function isDraftMeaningful(draft: InspectionDraft): boolean {
  if (draft.step > 0) return true
  return Object.entries(draft.values).some(
    ([key, value]) => key !== "date" && value?.trim()
  )
}
