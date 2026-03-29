import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdf-parse", "pdf2pic", "tesseract.js"],
};

export default nextConfig;
