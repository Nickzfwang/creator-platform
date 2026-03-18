/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@creator-platform/shared", "@creator-platform/db"],
  reactStrictMode: true,
};

export default nextConfig;
