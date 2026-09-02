import type { NextConfig } from "next";
import { BASE_SECURITY_HEADERS } from "./securityHeaders";

const securityHeaders = Object.entries(BASE_SECURITY_HEADERS).map(
  ([key, value]) => ({ key, value }),
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
