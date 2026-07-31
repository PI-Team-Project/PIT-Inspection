"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function InspectionSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    const timer = setTimeout(() => router.push("/"), 2500)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <div className="text-6xl">🚜</div>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">
        Thank you for your submission!
      </h1>
      <p className="mt-2 text-gray-600">Have a safe shift.</p>
      <Link
        href="/"
        className="mt-6 text-sm text-gray-500 underline transition-transform duration-100 active:scale-95 active:text-gray-700"
      >
        Return now
      </Link>
    </main>
  )
}
