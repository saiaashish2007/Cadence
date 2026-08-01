import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Moss ships native (napi) bindings — they can't be traced through the
  // bundler and have to be required at runtime from node_modules.
  serverExternalPackages: [
    "@moss-dev/moss",
    "@moss-dev/moss-core",
    "@moss-dev/moss-core-linux-x64-gnu",
  ],
};

export default nextConfig;
