import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: [
    "six-insects-throw.loca.lt", 
    "*.loca.lt", 
    "*.pinggy.link", 
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "192.168.100.26",
    "localhost"
  ],
};

export default nextConfig;
