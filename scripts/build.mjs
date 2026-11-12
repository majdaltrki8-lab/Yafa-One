import { execSync } from 'child_process'
import path from 'path'

const rootDir = process.cwd()

console.log('[build] Starting Yafa One build pipeline...')

// Step 1: Always build the standalone client bundle and design system for Android / static fallback
try {
  execSync('node scripts/build-standalone.mjs', { cwd: rootDir, stdio: 'inherit' })
  console.log('[build] ✔ Standalone client assets generated successfully.')
} catch (err) {
  console.error('[build] Standalone build error:', err)
  process.exit(1)
}

// Step 2: Run Next.js server production build for AI Studio Cloud Run deployment
try {
  console.log('[build] Running Next.js build...')
  execSync('npx next build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })
  console.log('[build] ✔ Next.js build completed successfully.')
} catch (err) {
  console.error('[build] Next.js build error:', err)
  process.exit(1)
}
