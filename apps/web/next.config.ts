import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@creator-platform/shared", "@creator-platform/db"],
  reactStrictMode: true,
};

export default nextConfig;
