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
        className="mt-5 flex w-full max-w-[240px] rounded-lg border border-gray-200 p-1"
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

      <p className="mt-4 text-gray-600">{tr(lang, "landing.subtitle")}</p>

      <p className="mt-4 text-base text-gray-600">
        {tr(lang, "landing.instr1")}{" "}
        <span className="rounded bg-amber-100 px-0.5 font-medium text-gray-700">
          {tr(lang, "landing.instrHighlight")}
        </span>{" "}
        {tr(lang, "landing.instr2")}
      </p>

      <div className="mt-12 flex w-full flex-col gap-3">
        <Link
          href={`/inspection?lang=${lang}`}
          className="rounded-lg bg-brand px-6 py-3 font-semibold text-white transition-transform duration-100 active:scale-95 active:bg-brand-dark"
        >
          {tr(lang, "landing.start")}
        </Link>
        <Link
          href="/dashboard"
          className="rounded-lg border border-brand/30 px-6 py-3 font-semibold text-brand transition-transform duration-100 active:scale-95 active:bg-brand/10"
        >
          {tr(lang, "landing.dashboard")}
        </Link>
      </div>

      <div className="mt-6 flex flex-col items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/qr-inspection.svg"
          alt="QR code linking to the inspection form"
          className="aspect-square w-full max-w-[128px] rounded-lg border border-gray-200 p-2"
        />
        <p className="text-xs text-gray-400">{tr(lang, "landing.scan")}</p>
      </div>
    </>
  )
}
