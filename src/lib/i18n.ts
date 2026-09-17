// Worker-facing bilingual copy for the inspection flow (start screen +
// wizard + success). English and Spanish only.
//
// The KEY PRINCIPLE that keeps the manager dashboard English no matter what
// language a worker fills the form in: this file only ever changes what is
// DISPLAYED. Every value actually submitted — the checklist answers, the
// shift, the equipment type — is the canonical English string (the radio's
// `value`, never its visible label). So a "Bueno" tapped in Spanish is
// stored as "Good", and the dashboard, CSV, and Excel exports read English
// exactly as before. Nothing here touches the data model.

export type Lang = "en" | "es"

export function normalizeLang(value: string | null | undefined): Lang {
  return value === "es" ? "es" : "en"
}

type Vars = Record<string, string | number>

// UI copy, keyed by a semantic id. English is the fallback for any key a
// translation happens to miss, so a missing Spanish string degrades to
// English rather than showing the raw key.
const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    "lang.en": "English",
    "lang.es": "Español",

    "landing.subtitle": "Warehouse vehicle pre-shift inspection.",
    "landing.instr1": "Inspection",
    "landing.instrHighlight": "must be completed at beginning of every shift",
    "landing.instr2": "to ensure equipment is in good condition to use. Thanks for keeping us safe.",
    "landing.start": "Start Inspection",
    "landing.dashboard": "Manager Dashboard",
    "landing.scan": "Scan to start an inspection",

    "wiz.subtitle": "You're the first to notice. Thank you for checking.",
    "wiz.hello": "Hello, {name}!",

    "resume.title": "Resume your unfinished inspection?",
    "resume.savedPrefix": "Saved",
    "resume.notSubmitted": "Not submitted yet.",
    "resume.reattach": "Any photos will need to be re-attached.",
    "resume.resume": "Resume",
    "resume.startOver": "Start Over",

    "step.date": "Inspection Date",
    "date.sub": "Let's get started — it only takes a couple of minutes.",
    "date.aria": "Inspection date",
    "date.select": "Select a date",

    "step.name": "Your Name",
    "name.last": "Last Name",
    "name.first": "First Name",

    "step.type": "What type of inspection is this?",
    "type.daily": "Daily Inspection",
    "type.repair": "Repair / Manager Inspection Request 🚩",

    "step.repair": "Describe the Problem",
    "repair.notify": "A manager will be notified to review this equipment right away.",
    "repair.whatsWrong": "What's wrong?",
    "repair.placeholder": "Describe the problem in as much detail as possible",
    "photos.optional": "(optional)",
    "label.photos": "Photos",

    "step.shift": "Which shift are you on?",
    "shift.mismatch": "⚠ Current time is {time} — that's {cur} shift right now. Submit this as {pick} shift anyway?",
    "shift.pickOther": "Pick the Other Shift",
    "shift.continueAnyway": "Continue Anyway",

    "step.equipment": "Which equipment are you inspecting?",
    "equip.selectType": "Please select the type of the equipment",
    "equip.selectForklift": "Select forklift type",
    "equip.selectColor": "Select color / make",

    "dup.chooseDifferent": "Choose a Different Vehicle",
    "dup.warning": "⚠ It's been inspected by {by} for {when}. Submit another inspection anyway?",

    "openissue.unresolved": "⚠ This vehicle has an unresolved safety issue",
    "openissue.pending": "⚠ This vehicle has an issue awaiting sign-off",
    "openissue.reported": "Reported {date} ({shift} shift)",
    "openissue.openDaysOne": " · open {n} day",
    "openissue.openDaysMany": " · open {n} days",
    "openissue.notInService": "It should not be in service until a supervisor confirms the repair.",
    "openissue.inspectAnyway": "Inspect It Anyway",

    "loc.notOnFile": "Location not on file",
    "loc.notHere": "Not here?",
    "loc.whereNow": "Where is it now?",
    "loc.select": "Select a location",
    "loc.supervisorConfirms": "A supervisor confirms this before it becomes the vehicle's location.",
    "loc.neverMind": "Never mind, it's at {loc}",

    "label.note": "Note",
    "note.placeholder": "Describe in as much detail as possible",

    "btn.back": "← Back",
    "btn.continue": "Continue",
    "btn.submit": "Submit Inspection",
    "btn.submitting": "Submitting…",
    "banner.dismiss": "Dismiss",

    "photo.converting": "Converting…",
    "photo.remove": "Remove photo",
    "photo.edit": "Edit photo",

    "err.missing-fields": "Some required fields were missing — please fill out the form again.",
    "err.unknown-equipment": "That vehicle couldn't be found — please pick a vehicle again.",
    "err.equipment-retired": "This vehicle was just retired — please choose a different vehicle.",
    "err.submit-failed": "Something went wrong submitting your inspection. Please try again.",

    "ok.stamp1": "Inspection",
    "ok.stamp2": "Completed",
    "ok.thanks": "Thank you for your submission!",
    "ok.safe": "Have a safe shift.",
    "ok.return": "Return now",
  },
  es: {
    "lang.en": "English",
    "lang.es": "Español",

    "landing.subtitle": "Inspección del vehículo antes del turno.",
    "landing.instr1": "La inspección",
    "landing.instrHighlight": "debe completarse al inicio de cada turno",
    "landing.instr2": "para asegurar que el equipo esté en buenas condiciones. Gracias por mantenernos seguros.",
    "landing.start": "Iniciar inspección",
    "landing.dashboard": "Manager Dashboard",
    "landing.scan": "Escanee para iniciar una inspección",

    "wiz.subtitle": "Usted es el primero en notarlo. Gracias por revisar.",
    "wiz.hello": "¡Hola, {name}!",

    "resume.title": "¿Reanudar su inspección sin terminar?",
    "resume.savedPrefix": "Guardado",
    "resume.notSubmitted": "Aún no enviado.",
    "resume.reattach": "Deberá volver a adjuntar las fotos.",
    "resume.resume": "Reanudar",
    "resume.startOver": "Empezar de nuevo",

    "step.date": "Fecha de inspección",
    "date.sub": "Comencemos — solo toma un par de minutos.",
    "date.aria": "Fecha de inspección",
    "date.select": "Seleccione una fecha",

    "step.name": "Su nombre",
    "name.last": "Apellido",
    "name.first": "Nombre",

    "step.type": "¿Qué tipo de inspección es?",
    "type.daily": "Inspección diaria",
    "type.repair": "Reparación / Solicitud al gerente 🚩",

    "step.repair": "Describa el problema",
    "repair.notify": "Se notificará a un gerente para revisar este equipo de inmediato.",
    "repair.whatsWrong": "¿Qué está mal?",
    "repair.placeholder": "Describa el problema con el mayor detalle posible",
    "photos.optional": "(opcional)",
    "label.photos": "Fotos",

    "step.shift": "¿En qué turno está?",
    "shift.mismatch": "⚠ La hora actual es {time} — ahora es el turno {cur}. ¿Enviar como turno {pick} de todos modos?",
    "shift.pickOther": "Elegir el otro turno",
    "shift.continueAnyway": "Continuar de todos modos",

    "step.equipment": "¿Qué equipo está inspeccionando?",
    "equip.selectType": "Seleccione el tipo de equipo",
    "equip.selectForklift": "Seleccione el tipo de montacargas",
    "equip.selectColor": "Seleccione color / marca",

    "dup.chooseDifferent": "Elegir otro vehículo",
    "dup.warning": "⚠ Ya fue inspeccionado por {by} en {when}. ¿Enviar otra inspección de todos modos?",

    "openissue.unresolved": "⚠ Este vehículo tiene un problema de seguridad sin resolver",
    "openissue.pending": "⚠ Este vehículo tiene un problema pendiente de aprobación",
    "openissue.reported": "Reportado {date} (turno {shift})",
    "openissue.openDaysOne": " · abierto {n} día",
    "openissue.openDaysMany": " · abierto {n} días",
    "openissue.notInService": "No debe usarse hasta que un supervisor confirme la reparación.",
    "openissue.inspectAnyway": "Inspeccionar de todos modos",

    "loc.notOnFile": "Ubicación no registrada",
    "loc.notHere": "¿No está aquí?",
    "loc.whereNow": "¿Dónde está ahora?",
    "loc.select": "Seleccione una ubicación",
    "loc.supervisorConfirms": "Un supervisor lo confirma antes de que sea la ubicación del vehículo.",
    "loc.neverMind": "No importa, está en {loc}",

    "label.note": "Nota",
    "note.placeholder": "Describa con el mayor detalle posible",

    "btn.back": "← Atrás",
    "btn.continue": "Continuar",
    "btn.submit": "Enviar inspección",
    "btn.submitting": "Enviando…",
    "banner.dismiss": "Descartar",

    "photo.converting": "Convirtiendo…",
    "photo.remove": "Quitar foto",
    "photo.edit": "Editar foto",

    "err.missing-fields": "Faltaron algunos campos obligatorios — por favor complete el formulario de nuevo.",
    "err.unknown-equipment": "No se encontró ese vehículo — por favor elija un vehículo de nuevo.",
    "err.equipment-retired": "Este vehículo acaba de ser retirado — por favor elija otro vehículo.",
    "err.submit-failed": "Algo salió mal al enviar su inspección. Por favor intente de nuevo.",

    "ok.stamp1": "Inspección",
    "ok.stamp2": "Completada",
    "ok.thanks": "¡Gracias por su envío!",
    "ok.safe": "Que tenga un turno seguro.",
    "ok.return": "Volver ahora",
  },
}

export function tr(lang: Lang, key: string, vars?: Vars): string {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""))
}

// Enumerated values shown to the worker but STORED in English. Display-only
// — the submitted value stays the map key. Facility/location codes (WH, MI1,
// …) are identifiers, not words, so they are deliberately never translated.
const DISPLAY_ES: Record<string, string> = {
  Day: "Día",
  Night: "Noche",
  Forklift: "Montacargas",
  "Pallet Jack": "Traspaleta",
  "Sit Down": "Sentado",
  Propane: "Propano",
  Standup: "De pie",
}

export function displayLabel(lang: Lang, value: string): string {
  return lang === "es" ? DISPLAY_ES[value] ?? value : value
}

// Checklist answer options: the radio VALUE stays English (what gets
// stored); only the visible label is translated.
const OPTION_ES: Record<string, string> = {
  Good: "Bueno",
  Poor: "Malo",
  "Other (Specify)": "Otro (especificar)",
  "Needs to be watered": "Necesita agua",
  "Good (No Exposed Wire)": "Bueno (sin cable expuesto)",
  Damaged: "Dañado",
  No: "No",
  Yes: "Sí",
  "Working condition": "Funciona",
  "Not working condition": "No funciona",
}

export function optionLabel(lang: Lang, value: string): string {
  return lang === "es" ? OPTION_ES[value] ?? value : value
}

// Checklist question labels + the one question note, keyed by question id.
const QUESTION_LABEL_ES: Record<string, string> = {
  tires: "Llantas",
  fluidBattery: "Niveles de líquido / batería",
  batteryPlug: "Enchufe de batería",
  batteryIndicator: "Indicador de batería",
  fluidLeaks: "¿Fugas de líquido?",
  bodyCondition: "Condición de la carrocería",
  horn: "Bocina",
  forwardBackward: "Movimiento adelante y atrás",
  liftLowering: "Movimiento de subida / bajada",
  repairRequest: "Solicitud de reparación",
}

const QUESTION_NOTE_ES: Record<string, string> = {
  fluidBattery: "Si necesita agua, llénela SOLO después de cargar completamente la batería.",
}

export function questionLabel(lang: Lang, q: { id: string; label: string }): string {
  return lang === "es" ? QUESTION_LABEL_ES[q.id] ?? q.label : q.label
}

export function questionNote(lang: Lang, q: { id: string; note?: string }): string | undefined {
  if (!q.note) return undefined
  return lang === "es" ? QUESTION_NOTE_ES[q.id] ?? q.note : q.note
}
