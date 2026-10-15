import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components / partial prefetching (create-next-app defaults) are
  // left off: every page behind auth is per-request dynamic anyway.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
