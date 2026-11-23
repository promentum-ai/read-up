import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Builds straight into the Firebase Hosting public folder (../firebase-public).
// emptyOutDir is off because that folder also holds SPEC.md and Firestore config;
// `npm run build` removes only the previous build's files (see scripts/clean-public.mjs).
export default defineConfig({
  plugins: [react()],
  build: { outDir: '../firebase-public', emptyOutDir: false },
  test: { include: ['src/**/*.test.ts'] },
})
