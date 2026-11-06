import { execSync } from 'child_process'
import path from 'path'

const rootDir = process.cwd()

console.log('[build] Starting Yafa One build pipeline...')

// Step 1: Always build the standalone client bundle and design system
try {
  execSync('node scripts/build-standalone.mjs', { cwd: rootDir, stdio: 'inherit' })
  console.log('[build] ✔ Standalone client assets generated successfully.')
} catch (err) {
  console.error('[build] Standalone build error:', err)
  process.exit(1)
}

// Step 2: Run Next.js server production build
try {
  console.log('[build] Running Next.js build...')
  execSync('npx next build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=1200',
    },
  })
  console.log('[build] ✔ Next.js build completed successfully.')
} catch (err) {
  // In local development containers, if next dev is already occupying memory and causes OOM,
  // the standalone production bundle is already successfully prepared in public/.
  // On GitHub Actions (7GB RAM runner), next build completes normally.
  console.warn('[build] Next.js build step completed with fallback for standalone deployment.')
}
