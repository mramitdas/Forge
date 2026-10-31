import type { NextConfig } from "next";

// Backend origin for the /api and /health proxies. Defaults to local dev;
// override with API_BACKEND_URL (apps/web/.env.local) when the API lives
// elsewhere (staging, Supabase-hosted deployment, …).
const backend = process.env.API_BACKEND_URL ?? "http://localhost:8000";
const backendHost = new URL(backend).hostname;

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backend}/api/:path*`,
      },
      {
        source: "/health/:path*",
        destination: `${backend}/health/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: backendHost },
      { protocol: "http", hostname: backendHost },
    ],
  },
  compress: true,
};

export default nextConfig;
