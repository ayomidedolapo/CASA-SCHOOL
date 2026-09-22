import type { NextConfig } from "next";

const scannerNoStoreHeaders = [
  {
    key: "Cache-Control",
    value:
      "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
  },
  {
    key: "Pragma",
    value: "no-cache",
  },
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./src/server/card-production/fonts/NotoSans.ttf",
    ],
  },
  async headers() {
    return [
      {
        source: "/scanner",
        headers:
          scannerNoStoreHeaders,
      },
      {
        source:
          "/scanner-sw.js",
        headers:
          scannerNoStoreHeaders,
      },
    ];
  },
};

export default nextConfig;
