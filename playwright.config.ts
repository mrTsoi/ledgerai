import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

// Make `playwright test` behave like local Next.js runs by loading `.env.local`.
// (Playwright itself does not automatically load Next.js env files.)
dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local' })

function getWebServerEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  return env
}

// NOTE: `npm run start` is pinned to `-p 3001` in `package.json`.
// Do not derive this from `process.env.PORT`, since `.env.local` may set PORT
// differently and cause Playwright to wait on the wrong port.
const resolvedBaseURL = process.env.BASE_URL || 'http://localhost:3001'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 5000 },
  use: {
    baseURL: resolvedBaseURL,
    headless: true,
    viewport: { width: 1280, height: 720 },
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: resolvedBaseURL,
    timeout: 120_000,
    reuseExistingServer: true,
    env: getWebServerEnv(),
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } }
  ]
})
