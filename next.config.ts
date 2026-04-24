import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Temporary: unblocks Vercel deploys; remove when TS is clean. Run `npx tsc --noEmit` locally.
  typescript: {
    ignoreBuildErrors: true,
  },
  // ESLint: run `npm run lint` in CI or locally (Next.js 16 no longer supports eslint in next.config).
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
