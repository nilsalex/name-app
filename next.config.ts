import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // Google Identity Services communicates with its popup via
        // postMessage; Vercel sends a cross-origin opener policy that
        // Chrome can treat as blocking that channel (console warning
        // "Cross-Origin-Opener-Policy policy would block the
        // window.postMessage call"). same-origin-allow-popups keeps the
        // app's own origin isolated while permitting the GIS popup flow.
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
