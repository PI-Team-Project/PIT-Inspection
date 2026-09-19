"use client"

// Last-resort boundary: catches an error in the root layout itself, which the
// segment-level error.tsx cannot reach. It replaces the whole document, so it
// renders its own <html>/<body> and uses inline styles (globals.css is loaded
// by the layout it is standing in for).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            'Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          background: "#ffffff",
          color: "#171717",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ margin: 0, fontSize: "14px", color: "#4b4b4b", maxWidth: "22rem" }}>
          The app hit a temporary error. Try again — it usually clears on a retry.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "8px",
            border: 0,
            borderRadius: "8px",
            background: "#726762",
            color: "#ffffff",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          Try again
        </button>
        {error.digest && (
          <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#9a9a9a" }}>
            Ref: {error.digest}
          </p>
        )}
      </body>
    </html>
  )
}
