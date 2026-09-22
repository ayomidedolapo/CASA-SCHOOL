import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": [
      "./src/server/card-production/fonts/NotoSans.ttf",
    ],
  },
};

export default nextConfig;
