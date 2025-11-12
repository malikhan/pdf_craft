/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  // Next.js 15 optimizations
  experimental: {
    // Enable React 19 features
    reactCompiler: false, // Set to true if you want to use React Compiler
  },
}

module.exports = nextConfig

