/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Agent API proxies (must come BEFORE the mock-api catch-all)
      {
        source: '/agent/:path*',
        destination: 'http://localhost:3002/:path*',
      },
      {
        source: '/procurement/:path*',
        destination: 'http://localhost:3003/:path*',
      },
      {
        source: '/sales/:path*',
        destination: 'http://localhost:3004/:path*',
      },
      // Mock API proxy
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
