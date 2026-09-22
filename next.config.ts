import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Inspections can carry several full-resolution phone photos per
      // submission (up to 6 for a repair request, 4 per flagged question
      // otherwise) — the 1MB default rejects that outright, which is why
      // submitting silently did nothing.
      bodySizeLimit: "25mb",
    },
  },
  // Baseline security headers on every response. A full script/style CSP is
  // deliberately left off for now — Next.js relies on inline scripts/styles
  // and a wrong CSP breaks the app; X-Frame-Options + frame-ancestors already
  // cover clickjacking, which is the main gap. camera=(self) is kept because
  // the inspection form captures photos.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ]
  },
};

export default nextConfig;
