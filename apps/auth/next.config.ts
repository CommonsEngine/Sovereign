import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Compile the design system from source (no watch build needed in dev).
  transpilePackages: ['@sovereignfs/ui'],
};

export default nextConfig;
