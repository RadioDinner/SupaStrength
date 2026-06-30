import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dedicated test config (no PWA plugin — not needed under test, and it slows
// startup). Engine tests are pure and run under `node`; component tests opt into
// jsdom per-file via `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**/*.ts'],
      // index.ts is a re-export barrel; types.ts is type-only — neither has
      // executable logic to cover.
      exclude: ['src/engine/index.ts', 'src/engine/types.ts'],
      thresholds: {
        // The engine is the crown jewel — keep it heavily covered.
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
})
