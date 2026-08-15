import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Specs live next to their sources; scope the run to src so the tsc
    // emission in lib/ (specs compile with the sources) is not re-run.
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
})
