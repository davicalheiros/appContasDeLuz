import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.4.6'],
  turbopack: {
    resolveAlias: { canvas: { browser: './src/lib/canvas-mock.ts' } },
  },
  webpack: (config) => {
    // pdfjs-dist uses canvas (native module) — mock it for webpack
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
