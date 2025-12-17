import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
      ,
      '@/components/ui/select': path.resolve(__dirname, 'tests/mocks/ui-select.tsx')
    }
  },
  test: {
    setupFiles: ['./tests/setup.ts'],
    environment: 'jsdom',
    exclude: [
      ...(
        // Vitest defaults
        // See: https://vitest.dev/config/#exclude
        ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**']
      ),
      // Playwright E2E tests live here; they should be run via `npx playwright test`
      'tests/e2e/**',
      // Prevent accidental collection of Playwright-style specs anywhere
      '**/*.spec.*'
    ]
  }
})
