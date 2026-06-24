import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // Tauri requires trailingSlash for file-based routing
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
