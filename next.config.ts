import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['lucide-react'] },
  async redirects() {
    return [
      { source: '/log_on', destination: '/', permanent: true },
      { source: '/voxflow', destination: '/platform', permanent: true },
    ];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default nextConfig;
