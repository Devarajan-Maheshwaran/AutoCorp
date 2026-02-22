/** @type {import('next').NextConfig} */
const nextConfig = {
async rewrites() {
return [
{ source: '/masteragent/:path*', destination: 'http://localhost:8787/:path*' },
{ source: '/agent8002/:path*', destination: 'http://localhost:8002/:path*' },
{ source: '/agent8003/:path*', destination: 'http://localhost:8003/:path*' },
{ source: '/agent8004/:path*', destination: 'http://localhost:8004/:path*' },
{ source: '/agent3002/:path*', destination: 'http://localhost:3002/:path*' },
{ source: '/agent8006/:path*', destination: 'http://localhost:8006/:path*' },
{ source: '/chartgen/:path*', destination: 'http://localhost:8009/:path*' },
{ source: '/api/:path*', destination: 'http://localhost:3001/:path*' },
]
},
}
module.exports = nextConfig
