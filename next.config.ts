import type { NextConfig } from "next";

/**
 * Extra dev origins (tunnels, LAN IPs) come from EXTRA_DEV_ORIGINS rather than
 * being hardcoded, so one developer's ngrok URL is not baked into the repo.
 */
const extraDevOrigins = (process.env.EXTRA_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: ["localhost", "127.0.0.1", ...extraDevOrigins],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), payment=()" },
        ],
      },
      {
        // The service worker must not be cached, or clients get stuck on an
        // old one after a deploy.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
