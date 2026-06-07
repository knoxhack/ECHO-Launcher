import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['server/community-chat/**', 'node_modules/**', 'dist/**'],
  },
})
