import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/src/**/*.test.{ts,tsx}',
      'apps/**/src/**/*.test.{ts,tsx}',
      'runtime/src/**/*.test.{ts,tsx}',
      // Plugin source tests. Only the source tree under plugins/ is matched —
      // the composed copies live under runtime/app/(platform)/(plugins)/ and
      // are not covered by any include pattern, so they are never double-run.
      'plugins/**/*.test.{ts,tsx}',
    ],
    // Default to node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` pragma at the top of the file.
    environment: 'node',
    css: {
      // Resolve CSS Module class names to their literal names so component
      // tests can assert on them (e.g. styles.ghost === 'ghost').
      modules: { classNameStrategy: 'non-scoped' },
    },
  },
});
