"use client"

import { useState } from "react"

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

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Desktop already sees the name on hover via the title tooltip, so a
    // single click there should just navigate like normal. Touch devices
    // have no real hover, so the first tap reveals the name instead of
    // navigating — the second tap (now revealed) goes through.
    if (window.matchMedia("(hover: hover)").matches) return
    if (!revealed) {
      e.preventDefault()
      setRevealed(true)
    }
  }

  return (
    <a href={href} title={`Inspected by ${inspectorName}`} onClick={handleClick} className={className}>
      {label}
      {revealed && <span className="ml-1 font-normal opacity-70">· {inspectorName}</span>}
    </a>
  )
}
