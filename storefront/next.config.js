const checkEnvVariables = require("./check-env-variables")

checkEnvVariables()

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      { 
        protocol: "https",
        // Fallback to localhost if missing to prevent Next.js build crash
        hostname: process.env.NEXT_PUBLIC_BASE_URL ? process.env.NEXT_PUBLIC_BASE_URL.replace(/^https?:\/\//, '') : 'localhost',
      },
      { 
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ? process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL.replace(/^https?:\/\//, '') : 'localhost',
      },
      { 
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      { 
        protocol: "https",
        hostname: "medusa-server-testing.s3.amazonaws.com",
      },
      { 
        protocol: "https",
        hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
      },
      { 
        protocol: "https",
        // Added regex strip to ensure https:// doesn't crash the hostname
        hostname: process.env.NEXT_PUBLIC_MINIO_ENDPOINT ? process.env.NEXT_PUBLIC_MINIO_ENDPOINT.replace(/^https?:\/\//, '') : 'localhost',
      }
    ],
  },
  serverRuntimeConfig: {
    port: process.env.PORT || 3000
  }
}

module.exports = nextConfig