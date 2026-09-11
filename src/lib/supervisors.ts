// The supervisors who sign off on inspections. Everywhere the app asks for a
// supervisor's name offers these first, with a free-text fallback — a tap
// instead of typing a name into a phone keyboard, and the same spelling
// every time.
//
// Spelling matters more than it looks. Ten test submissions produced six
// different inspector names for two or three people — "E K" and "E Kim",
// "Bum Yoon Kim" and "Kim The", "Derek Mackety" and "The I'm" — because a
// phone keyboard autocorrects names it does not recognise. A signature that
// varies is a signature you cannot search, group or count on.
//
// EDIT THIS LIST as the team changes. Nothing else needs touching: all three
// places that capture a supervisor name read from here.
export const SUPERVISORS = ["Bum Yoon Kim", "Derek Mackety"] as const

// The value the picker uses for "not one of the above". Deliberately not a
// plausible name, so it can never be mistaken for one if it ever reaches the
// database by accident.
export const OTHER_SUPERVISOR = "__other__"
