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
};

export default nextConfig;
