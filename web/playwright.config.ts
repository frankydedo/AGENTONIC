import { defineConfig } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// I test end-to-end avviano un backend e una UI dedicati, su porte diverse da quelle di sviluppo.
// Serve il venv del backend nella root (vedi docs/api.md). Chrome di sistema; senza Chrome:
// `npx playwright install chromium` e PW_CHANNEL=chromium.
const BACKEND = 8011
const UI = 5180
// Database nuovo a ogni esecuzione e modello finto (risposte registrate in dati/mock_llm).
const DB = join(tmpdir(), 'agentonic-e2e.db')
const UVICORN = process.env.UVICORN ?? '.venv/bin/uvicorn'
const PYTHON = process.env.PYTHON ?? '.venv/bin/python'

export const BACKEND_URL = `http://127.0.0.1:${BACKEND}`

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${UI}`,
    channel: process.env.PW_CHANNEL ?? 'chrome',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `rm -f ${DB} && ${PYTHON} scripts/crea_db.py && ${UVICORN} backend.app:app --port ${BACKEND}`,
      cwd: '..',
      env: { BRAIN_DB: DB, LLM_PROVIDER: 'mock' },
      url: `http://127.0.0.1:${BACKEND}/persone`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npx vite --port ${UI} --strictPort --host 127.0.0.1`,
      env: { BACKEND_URL: `http://127.0.0.1:${BACKEND}` },
      url: `http://127.0.0.1:${UI}`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
