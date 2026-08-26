import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.64.2"],
  turbopack: {
    root: path.join(__dirname),
  },
  experimental: {
    // Every upload route caps at 100 MB and says so in its 413. The proxy
    // sits in front of them, so a lower cap here is the real limit and the
    // route's own error message becomes a lie.
    proxyClientMaxBodySize: '100mb',
  },
  serverExternalPackages: ["undici"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "**.r2.dev" },
      { protocol: "https", hostname: "*.replicate.delivery" },
      { protocol: "https", hostname: "pbxt.replicate.delivery" },
      { protocol: "https", hostname: "*.replicate.com" },
      { protocol: "https", hostname: "*.aiquickdraw.com" },
    ],
  },
};

export default nextConfig;
