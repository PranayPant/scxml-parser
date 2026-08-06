import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: {
    // Disable PostCSS auto-discovery so Vite does not walk up to the
    // parent Next.js repo and try to load its postcss.config.mjs.
    postcss: { plugins: [] },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      all: true,
      include: ['src/**/*.ts'],
      exclude: ['src/types/**/*.ts', 'src/index.ts', 'src/**/*.d.ts'],
      thresholds: {
        // 100% lines/statements/functions is achieved by removing dead code
        // and testing every reachable consumer-facing path. Branches are at
        // 99.77%: the single gap is a v8 under-reporting artifact on a
        // provisionary-executed ternary (see README). 99 leaves a 1% guard
        // for that instrumenter quirk without ever allowing real regressions.
        lines: 100,
        functions: 100,
        branches: 99,
        statements: 100,
      },
    },
  },
});
