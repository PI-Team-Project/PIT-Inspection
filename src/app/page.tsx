import StartLanguageChooser from "./StartLanguageChooser"

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-4 pt-[clamp(0.75rem,3dvh,2rem)] pb-[clamp(0.5rem,2dvh,1rem)] text-center">
      <p className="text-xs font-medium tracking-wide text-gray-400">Holland, Michigan</p>
      <h1 className="mt-1 text-[clamp(1.5rem,4.5dvh,1.875rem)] leading-tight font-bold text-gray-900">PIT Inspection</h1>

      <StartLanguageChooser />
    </main>
  )
}
