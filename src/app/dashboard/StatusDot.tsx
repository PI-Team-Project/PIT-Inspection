import type { Stage } from "@/lib/review"

const STATUS_DOT: Record<Stage | "none", { dot: string; glow: string; glowLg: string }> = {
  unresolved: {
    dot: "bg-red-500 ring-1 ring-red-600/40",
    glow: "shadow-[0_0_4px_1px_rgba(239,68,68,0.7)]",
    glowLg: "shadow-[0_0_2px_0.5px_rgba(239,68,68,0.8)]",
  },
  "pending-confirm": {
    dot: "bg-yellow-400 ring-1 ring-yellow-500/40",
    glow: "shadow-[0_0_4px_1px_rgba(250,204,21,0.7)]",
    glowLg: "shadow-[0_0_2px_0.5px_rgba(250,204,21,0.8)]",
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

export default function StatusDot({
  stage,
  size = "sm",
}: {
  stage: Stage | "none"
  size?: "sm" | "lg" | "xl"
}) {
  const c = STATUS_DOT[stage]
  const blink = stage === "unresolved" ? "animate-[status-blink_1.3s_ease-in-out_infinite]" : ""
  if (size === "xl") {
    return (
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.dot} ${c.glow} ${blink}`}
      />
    )
  }
  if (size === "lg") {
    return (
      <span className={`inline-block h-4 w-4 shrink-0 rounded-full ${c.dot} ${c.glowLg} ${blink}`} />
    )
  }
  return (
    <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${c.dot} ${c.glow} ${blink}`} />
  )
}
