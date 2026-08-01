/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "mammoth", "@xenova/transformers", "onnxruntime-node"],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), "onnxruntime-node", "sharp"];
    return config;
  },
};

module.exports = nextConfig;
