import { defineConfig } from 'vitest/config'

// Separato da vite.config.ts: cambiarlo non riavvia il dev server.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
