import type { NextConfig } from "next";

const ffprobeBinary = `./node_modules/ffprobe-static/bin/${process.platform}/${process.arch}/ffprobe${process.platform === "win32" ? ".exe" : ""}`;

const nextConfig: NextConfig = {
  distDir: process.env.KRIYA_NEXT_DIST_DIR || ".next",
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  outputFileTracingIncludes: {
    "/*": [`./node_modules/ffmpeg-static/ffmpeg${process.platform === "win32" ? ".exe" : ""}`, ffprobeBinary, "./app/create/music-video/_lib/blender-render.py"],
  },
  // Native model packaging is explicit. Never trace old desktop/evaluation
  // artifacts or local recordings into the next standalone application.
  outputFileTracingExcludes: {
    "/*": ["./release/**/*", "./.desktop/**/*", "./build/**/*", "./native/**/*", "./data/**/*", "./ios/**/*", "./.next-ios/**/*", "./.ios-runtime/**/*"],
  },
};

export default nextConfig;
