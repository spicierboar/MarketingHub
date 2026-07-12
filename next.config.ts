import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Demo scripts open http://127.0.0.1:3002 while `next dev` binds as localhost.
  // Next 16 blocks cross-origin /_next/* (incl. HMR + some chunks) unless listed —
  // without this, React never hydrates and client buttons (Add client modal) look dead.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
