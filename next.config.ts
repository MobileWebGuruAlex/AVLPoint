import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Let the dev server serve its JS/CSS when viewed through an ngrok tunnel
  // (dev-only setting; production builds don't need it).
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app"],
};

export default nextConfig;
