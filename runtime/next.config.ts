import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the single monorepo-root .env (mirrors apps/auth). No per-app .env files.
loadEnvConfig(resolve(process.cwd(), '..'), process.env.NODE_ENV !== 'production');

const nextConfig: NextConfig = {
  // Compile all workspace packages from source — package edits trigger HMR.
  transpilePackages: [
    '@sovereignfs/sdk',
    '@sovereignfs/ui',
    '@sovereignfs/db',
    '@sovereignfs/manifest',
    '@sovereignfs/mailer',
  ],
  webpack: (config) => {
    // Follow symlinks so plugin source (symlinked into app/plugins/) hot-reloads.
    config.resolve ??= {};
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
