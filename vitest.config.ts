import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.test.{ts,tsx}'],
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
