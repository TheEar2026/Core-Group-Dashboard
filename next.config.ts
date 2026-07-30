import type { NextConfig } from "next";

// script-src/style-src need 'unsafe-inline': Next.js streams RSC hydration
// data via inline <script> tags (self.__next_f.push(...)) on every page, and
// the app uses React inline `style={{...}}` throughout for dynamic colors
// (badges, bars, charts) -- both would otherwise be blocked outright. A
// nonce-based CSP would tighten script-src further but needs per-request
// nonce plumbing through the proxy middleware; 'self' still blocks loading
// any *external* script/style, which is the main thing worth stopping here.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    // Data uploads post mapped CSV rows to a Server Action; allow bigger payloads.
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
