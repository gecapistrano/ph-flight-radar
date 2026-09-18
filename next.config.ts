import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Turbopack walks up the filesystem
  // looking for a lockfile and can latch onto an unrelated one in a parent
  // directory.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
