import StartLanguageChooser from "./StartLanguageChooser"

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-lg flex-col items-center justify-center px-4 pt-8 pb-4 text-center">
      <p className="text-xs font-medium tracking-wide text-gray-400">Holland, Michigan</p>
      <h1 className="mt-2 text-3xl font-bold text-gray-900">PIT Inspection</h1>

      <StartLanguageChooser />
    </main>
  )
}
