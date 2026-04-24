import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Production builds run `next build`; ESLint is enforced via `npm run lint` in CI or locally.
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["pino", "pino-pretty", "pdf-parse", "pdfjs-dist"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
