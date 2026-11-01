import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Production builds use Turbopack (default in Next 16). The webpack
  // hook below only applies to `next dev --webpack`, which the visual
  // suite's dev server uses (feature 012). The empty turbopack block
  // declares that coexistence explicitly instead of erroring the build.
  turbopack: {},
  // The fake Redis client (feature 012, visual suite) is bundled into the
  // instrumentation entry, whose webpack "instrument" layer cannot bundle
  // node: builtins like `node:crypto` (UnhandledSchemeError). Externalize
  // node: builtins for server-side compilations; harmless for the regular
  // route bundles (they already externalize them) and skipped for the client.
  webpack(config, { isServer }: { isServer: boolean }) {
    if (isServer) {
      config.externals.push(async ({ request }: { request?: string | boolean }) => {
        if (typeof request === "string" && /^node:/.test(request)) {
          return `commonjs ${request}`;
        }
        return undefined;
      });
    }
    return config;
  },
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
