"use client"

import { useState } from "react"

// Workers can fill the inspection in Spanish, and while every tapped answer
// is stored in English (see src/lib/i18n.ts), anything they TYPE — a note,
// a repair description, an actual location — is kept as written. This puts
// an English translation one tap away for the supervisor, right under the
// text, without touching the stored record.
//
// Desktop Chrome 138+ / Edge 148+ ship a built-in Translator API that runs
// on the device: free, no API key, and the note never leaves the browser.
// Everywhere else (phones, Safari, Firefox) the same button opens Google
// Translate in a new tab with the text filled in.

type TranslatorLike = { translate(text: string): Promise<string> }
type TranslatorStatic = {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<string>
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorLike>
}

function builtInTranslator(): TranslatorStatic | null {
  if (typeof window === "undefined") return null
  return (window as unknown as { Translator?: TranslatorStatic }).Translator ?? null
}

// One translator per page, shared by every note — creating it can mean a
// one-time model download, so it is only ever done once.
let translatorPromise: Promise<TranslatorLike> | null = null

function googleTranslateUrl(text: string) {
  return `https://translate.google.com/?sl=auto&tl=en&op=translate&text=${encodeURIComponent(text)}`
}

export default function TranslateNote({ text, dark = false }: { text: string; dark?: boolean }) {
  const [translation, setTranslation] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick(e: React.MouseEvent) {
    // Notes sit inside a <details> and a sign-off <form>; neither should react.
    e.preventDefault()
    e.stopPropagation()
    if (translation !== null) {
      setTranslation(null)
      return
    }
    const Translator = builtInTranslator()
    if (!Translator) {
      window.open(googleTranslateUrl(text), "_blank", "noopener")
      return
    }
    setBusy(true)
    try {
      const opts = { sourceLanguage: "es", targetLanguage: "en" }
      if (!translatorPromise) {
        if ((await Translator.availability(opts)) === "unavailable") throw new Error("unavailable")
        translatorPromise = Translator.create(opts)
      }
      setTranslation(await (await translatorPromise).translate(text))
    } catch {
      translatorPromise = null
      window.open(googleTranslateUrl(text), "_blank", "noopener")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={`ml-1 text-[10px] font-semibold underline ${dark ? "text-white/70" : "text-brand"}`}
      >
        {busy ? "Translating…" : translation !== null ? "Hide English" : "Translate"}
      </button>
      {translation !== null && (
        <span className={`block italic ${dark ? "text-white/80" : "text-gray-600"}`}>EN: {translation}</span>
      )}
    </>
  )
}
