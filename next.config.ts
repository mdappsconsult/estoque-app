import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Imagem Docker no Railway: artefato menor e cache de layers (node_modules + build).
  output: "standalone",
};

export default nextConfig;
