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
    environment: 'jsdom'
  }
})
