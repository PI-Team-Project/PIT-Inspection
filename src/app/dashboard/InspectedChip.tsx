"use client"

import { useRef, useState } from "react"

export default function InspectedChip({
  href,
  label,
  inspectorName,
  className,
}: {
  href: string
  label: string
  inspectorName: string
  className: string
}) {
  const [revealed, setRevealed] = useState(false)
  // A device-capability guess like `matchMedia("(hover: hover)")` can
  // misreport on real touch hardware — the pointer type of the actual tap
  // that's happening right now is the reliable signal, so it's captured on
  // pointerdown (a real PointerEvent) and read back inside the click
  // handler that follows it.
  const lastPointerType = useRef("mouse")

  function handlePointerDown(e: React.PointerEvent<HTMLAnchorElement>) {
    lastPointerType.current = e.pointerType
  }

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (lastPointerType.current === "mouse") return
    if (!revealed) {
      e.preventDefault()
      setRevealed(true)
    }
  }

  return (
    <a
      href={href}
      title={`Inspected by ${inspectorName}`}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={className}
    >
      {label}
      {revealed && <span className="ml-1 font-normal opacity-70">· {inspectorName}</span>}
    </a>
  )
}
