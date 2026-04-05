import { withSentryConfig } from "@sentry/nextjs";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@creator-platform/shared", "@creator-platform/db"],
  reactStrictMode: true,
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${apiUrl}/uploads/:path*`,
      },
    ];
  },
};

const withI18n = withNextIntl(nextConfig);

// Only wrap with Sentry if DSN is configured
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(withI18n, {
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      hideSourceMaps: true,
    })
  : withI18n;
