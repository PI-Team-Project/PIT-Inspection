"use client"

import { useState } from "react"
import Link from "next/link"
import { type Lang, tr } from "@/lib/i18n"

// The start screen's language switch. Choosing Español localizes the copy
// here and, more importantly, carries the choice into the wizard as
// `/inspection?lang=es` — the dashboard is deliberately left English, so
// the switch lives only on the worker's entry point, never the manager's.
export default function StartLanguageChooser() {
  const [lang, setLang] = useState<Lang>("en")

  return (
    <>
      <div
        role="group"
        aria-label="Language"
        className="mt-[clamp(0.75rem,2.5dvh,1.25rem)] flex w-full max-w-[240px] rounded-lg border border-gray-200 p-1"
      >
        {(["en", "es"] as const).map((code) => {
          const active = lang === code
          return (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              aria-pressed={active}
              className={`flex-1 rounded-md py-2 text-sm font-semibold transition-transform duration-100 active:scale-95 ${
                active ? "bg-brand text-white" : "text-gray-500"
              }`}
            >
              {tr(lang, code === "en" ? "lang.en" : "lang.es")}
            </button>
          )
        })}
      </div>

      {/* Both languages are rendered in the same grid cell, the inactive one
          invisible, so the block is always as tall as the longer language
          and switching only swaps the words — the buttons and QR below never
          move. No hand-tuned min-height to go stale when the copy changes. */}
      <div className="mt-[clamp(0.5rem,2dvh,1rem)] grid w-full">
        {(["en", "es"] as const).map((code) => (
          <div
            key={code}
            aria-hidden={code !== lang}
            className={`col-start-1 row-start-1 flex flex-col items-center gap-[clamp(0.5rem,1.5dvh,0.75rem)] text-gray-600 ${
              code === lang ? "" : "invisible"
            }`}
          >
            <p className="m-0">{tr(code, "landing.subtitle")}</p>
            <p className="m-0 text-[15px] leading-snug sm:text-base">{tr(code, "landing.instrMain")}</p>
            <p className="m-0 text-[15px] leading-snug sm:text-base">{tr(code, "landing.instrThanks")}</p>
          </div>
        ))}
      </div>

      <div className="mt-[clamp(1rem,5dvh,3rem)] flex w-full flex-col gap-[clamp(0.5rem,1.5dvh,0.75rem)]">
        <Link
          href={`/inspection?lang=${lang}`}
          className="rounded-lg bg-brand px-6 py-[clamp(0.625rem,1.6dvh,0.75rem)] font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
        >
          {tr(lang, "landing.start")}
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-brand/30 px-6 py-[clamp(0.625rem,1.6dvh,0.75rem)] font-semibold text-brand transition-transform duration-100 active:scale-95 active:bg-brand/10"
        >
          {tr(lang, "landing.dashboard")}
        </Link>
      </div>

      <div className="mt-[clamp(0.75rem,3dvh,1.5rem)] flex flex-col items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qr-inspection.svg"
          alt="QR code linking to the inspection form"
          className="aspect-square w-[clamp(64px,calc(20dvh-40px),128px)] rounded-lg border border-gray-200 p-2"
        />
        <p className="text-xs text-gray-400">{tr(lang, "landing.scan")}</p>
      </div>
    </>
  )
}
