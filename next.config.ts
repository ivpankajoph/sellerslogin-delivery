import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.devtool = false;
      config.output = { ...config.output, chunkLoadTimeout: 180000 };
    }
    return config;
  },
};

export default nextConfig;
