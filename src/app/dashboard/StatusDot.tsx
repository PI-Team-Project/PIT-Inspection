import type { Stage } from "@/lib/review"

// Shape carries the meaning here, color is secondary — red/green is the one
// confusion (unresolved vs. clean) that would actually be dangerous to miss,
// so each stage gets a distinct silhouette, not just a different hue.
// unresolved: triangle (warning) · pending-confirm: diamond · confirmed/
// clean: circle (checkmark-shaped via clip-path) · none: small square.
const STATUS_DOT: Record<
  Stage | "none",
  { dot: string; glow: string; glowLg: string; clipPath?: string }
> = {
  unresolved: {
    dot: "bg-red-500 ring-1 ring-red-600/40",
    glow: "shadow-[0_0_4px_1px_rgba(239,68,68,0.7)]",
    glowLg: "shadow-[0_0_2px_0.5px_rgba(239,68,68,0.8)]",
    clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
  },
  "pending-confirm": {
    dot: "bg-yellow-400 ring-1 ring-yellow-500/40",
    glow: "shadow-[0_0_4px_1px_rgba(250,204,21,0.7)]",
    glowLg: "shadow-[0_0_2px_0.5px_rgba(250,204,21,0.8)]",
    clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  },
  confirmed: {
    dot: "bg-green-500 ring-1 ring-green-600/40",
    glow: "shadow-[0_0_4px_1px_rgba(34,197,94,0.7)]",
    glowLg: "shadow-[0_0_2px_0.5px_rgba(34,197,94,0.8)]",
  },
  clean: {
    dot: "bg-green-500 ring-1 ring-green-600/40",
    glow: "shadow-[0_0_4px_1px_rgba(34,197,94,0.7)]",
    glowLg: "shadow-[0_0_2px_0.5px_rgba(34,197,94,0.8)]",
  },
  none: { dot: "bg-gray-400 ring-1 ring-gray-500/30", glow: "", glowLg: "" },
}

const SIZE_CLASS = { xl: "h-2.5 w-2.5", lg: "h-4 w-4", sm: "h-3 w-3" }

export default function StatusDot({
  stage,
  size = "sm",
}: {
  stage: Stage | "none"
  size?: "sm" | "lg" | "xl"
}) {
  const c = STATUS_DOT[stage]
  const blink = stage === "unresolved" ? "animate-[status-blink_1.3s_ease-in-out_infinite]" : ""
  const glow = size === "lg" ? c.glowLg : c.glow
  return (
    <span
      style={c.clipPath ? { clipPath: c.clipPath } : undefined}
      className={`inline-block shrink-0 ${SIZE_CLASS[size]} ${c.dot} ${glow} ${blink} ${
        c.clipPath ? "" : "rounded-full"
      }`}
    />
  )
}
