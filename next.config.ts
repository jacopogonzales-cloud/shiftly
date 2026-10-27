import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [{ source: "/", destination: "/jobs", permanent: false }];
  },
  turbopack: {
    rules: {
      "*.css": {
        // Only our own CSS goes through Tailwind; vendor CSS (Bryntum) is used as shipped.
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
