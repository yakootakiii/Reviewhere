import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This project sits inside a home directory that has its own package-lock.json;
  // pin the root so Turbopack doesn't walk up and pick that one instead.
  turbopack: { root: __dirname },
};

export default nextConfig;
