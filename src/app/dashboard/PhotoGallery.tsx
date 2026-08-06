"use client"

import { useEffect, useState } from "react"

export default function PhotoGallery({
  photos,
  notes,
}: {
  photos: string[]
  notes?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  function openAt(i: number) {
    setIndex(i)
    setOpen(true)
  }

  return (
    <>
      <div className="flex gap-1.5">
        {photos.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => openAt(i)}
            className="min-w-0 flex-1 text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="aspect-square w-full rounded-md border border-gray-200 object-cover"
            />
            {notes?.[i] && (
              <p
                className="mt-0.5 truncate text-[10px] text-gray-500"
                title={notes[i]}
              >
                {notes[i]}
              </p>
            )}
          </button>
        ))}
      </div>

      {open && (
        <Lightbox
          photos={photos}
          notes={notes}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function Lightbox({
  photos,
  notes,
  index,
  onIndexChange,
  onClose,
}: {
  photos: string[]
  notes?: string[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) {
  const hasMultiple = photos.length > 1

  function prev() {
    onIndexChange((index - 1 + photos.length) % photos.length)
  }
  function next() {
    onIndexChange((index + 1) % photos.length)
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") prev()
      if (e.key === "ArrowRight") next()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length])

  function handleDownload() {
    const src = photos[index]
    const mimeMatch = /^data:([^;]+);/.exec(src)
    const ext = mimeMatch?.[1]?.split("/")[1] ?? "jpg"
    const a = document.createElement("a")
    a.href = src
    a.download = `photo-${index + 1}.${ext}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close"
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-100 active:scale-90"
      >
        <XIcon className="h-4 w-4" />
      </button>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              prev()
            }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-100 active:scale-90"
          >
            <ChevronIcon className="h-5 w-5" direction="left" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              next()
            }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-100 active:scale-90"
          >
            <ChevronIcon className="h-5 w-5" direction="right" />
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg object-contain"
      />

      {notes?.[index] && (
        <p
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-16 left-1/2 max-w-[85%] -translate-x-1/2 rounded-lg bg-black/60 px-3 py-1.5 text-center text-sm text-white"
        >
          {notes[index]}
        </p>
      )}

      {hasMultiple && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70">
          {index + 1} / {photos.length}
        </p>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          handleDownload()
        }}
        aria-label="Download photo"
        className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-transform duration-100 active:scale-90"
      >
        <DownloadIcon className="h-5 w-5" />
      </button>
    </div>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className={className}
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function ChevronIcon({
  className,
  direction,
}: {
  className?: string
  direction: "left" | "right"
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  )
}
