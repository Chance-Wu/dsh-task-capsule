import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Specs live next to their sources; scope the run to src so the tsc
    // emission in lib/ (specs compile with the sources) is not re-run.
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    // Pure-logic specs run on node; component specs opt into jsdom per file.
    environment: 'node',
  },
})
