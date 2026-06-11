import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the single monorepo-root .env (no per-app .env files). Runs before the
// app boots, so process.env is populated for both the server and migrations.
loadEnvConfig(resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production');

const nextConfig: NextConfig = {
  // Compile the design system from source (no watch build needed in dev).
  transpilePackages: ['@sovereignfs/ui'],
};

export default nextConfig;
