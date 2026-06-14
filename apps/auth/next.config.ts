import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

// Load the single monorepo-root .env (no per-app .env files). Runs before the
// app boots, so process.env is populated for both the server and migrations.
loadEnvConfig(resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production');

const nextConfig: NextConfig = {
  // Self-contained production server (`.next/standalone`) for the Docker image.
  // Tracing is rooted at the monorepo root so workspace package files are
  // included in the standalone output.
  output: 'standalone',
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  // Compile the design system from source (no watch build needed in dev).
  transpilePackages: ['@sovereignfs/ui'],
};

export default nextConfig;
