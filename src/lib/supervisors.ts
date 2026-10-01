// The supervisors who sign off on inspections. Everywhere the app asks for a
// supervisor's name offers these first, with "+ Add supervisor" as the
// fallback — a tap instead of typing a name into a phone keyboard, and the
// same spelling every time.
//
// Spelling matters more than it looks. Ten test submissions produced six
// different inspector names for two or three people — "E K" and "E Kim",
// "Bum Yoon Kim" and "Kim The", "Derek Mackety" and "The I'm" — because a
// phone keyboard autocorrects names it does not recognise. A signature that
// varies is a signature you cannot search, group or count on.
//
// The list lives in the Supervisor table and is edited from the dashboard's
// Settings; a typed name is added the first time it signs (see
// recordSupervisor).

// The value the picker uses for "not one of the above". Deliberately not a
// plausible name, so it can never be mistaken for one if it ever reaches the
// database by accident.
export const OTHER_SUPERVISOR = "__other__"

// The fallback every signing action already uses for a blank name — never a
// real person, so never added to the list.
export const NO_NAME = "Unknown"

export const MAX_SUPERVISOR_NAME_LENGTH = 60

export function normalizeSupervisorName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_SUPERVISOR_NAME_LENGTH)
}
