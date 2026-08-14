import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['lucide-react'] },
  async redirects(){return [
    {source:'/log_on',destination:'/',permanent:true},
    {source:'/voxflow',destination:'/platform',permanent:true}
  ]}
};

export default nextConfig;
