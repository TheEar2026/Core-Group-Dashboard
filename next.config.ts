import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Data uploads post mapped CSV rows to a Server Action; allow bigger payloads.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
