import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // 3.8MB icon font: without a long cache every page view re-downloads it and icons render as raw ligature text meanwhile.
  headers: async () => [
    { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
  // Same-origin proxy to the Express API: no CORS setup needed in dev or behind nginx.
  rewrites: async () => [{ source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` }],
};

export default nextConfig;
