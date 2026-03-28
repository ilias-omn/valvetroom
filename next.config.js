/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
    serverComponentsExternalPackages: ['firebase-admin', 'better-sqlite3'],
  },
};

module.exports = nextConfig;
