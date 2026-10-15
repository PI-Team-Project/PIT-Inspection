"use client"

// Switches between day and night mode. The label names the mode you'd switch
// TO ("Night" while it's light), and is chosen with dark: classes rather
// than state, so the server-rendered button is already right before React
// loads — the theme itself is set by the inline script in layout.tsx.
//
// Until this is pressed the app follows the device setting; pressing saves
// an explicit choice on this device.
export default function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const root = document.documentElement
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark"
    root.setAttribute("data-theme", next)
    try {
      localStorage.setItem("theme", next)
    } catch {
      // Private mode etc. — the switch still applies for this page view.
    }
  }

  return (
    <button type="button" onClick={toggle} className={className}>
      <span className="inline-flex items-center gap-1.5 dark:hidden">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
        Night
      </span>
      <span className="hidden items-center gap-1.5 dark:inline-flex">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        Day
      </span>
    </button>
  )
}
