import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forme loads its packaged WASM beside the Node entry point. Keep the
  // renderer out of the RSC bundle, including React's serializer dependency.
  serverExternalPackages: ["@formepdf/core", "@formepdf/react"],
};

export default nextConfig;
