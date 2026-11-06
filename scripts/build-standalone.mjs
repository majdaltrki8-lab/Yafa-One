import { build } from 'esbuild'
import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'

const rootDir = process.cwd()

async function buildStandalone() {
  console.log('[1/3] Bundling Yafa One standalone application with esbuild...')
  
  await build({
    entryPoints: [path.join(rootDir, 'src', 'standalone-entry.tsx')],
    bundle: true,
    outfile: path.join(rootDir, 'public', 'app.js'),
    format: 'esm',
    minify: true,
    sourcemap: false,
    target: ['es2020', 'chrome80', 'edge80'],
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env.NEXT_PUBLIC_SITE_URL': '"https://com.yafaone.app"',
    },
    loader: {
      '.png': 'dataurl',
      '.jpg': 'dataurl',
      '.svg': 'text',
    },
  })
  console.log('✔ Generated public/app.js')

  console.log('[2/3] Compiling Tailwind CSS design system with @tailwindcss/cli...')
  execSync('npx @tailwindcss/cli -i "src/app/(frontend)/styles.css" -o "public/app.css"', {
    cwd: rootDir,
    stdio: 'inherit',
  })
  console.log('✔ Generated public/app.css')

  console.log('[3/3] Preparing public/index.html for native Android container...')
  const htmlContent = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>يافع ون | Yafa One</title>
  <link rel="stylesheet" href="app.css">
  <link rel="icon" href="icons/icon-512.png">
  <style>
    @keyframes yafa-spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body class="min-h-screen bg-white text-zinc-950 antialiased" dir="rtl">
  <div id="root">
    <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 30%, #08614f 0%, #064b3d 60%, #032b23 100%); color: white; padding: 24px; text-align: center;">
      <div style="width: 120px; height: 120px; margin-bottom: 20px; border-radius: 26px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.4); background: #064b3d; display: flex; align-items: center; justify-content: center;">
        <img src="assets/aistudio/file_0000000007288208a6004fdc6e9447ff_d4d60dcb.jpg" alt="يافع ون" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='yafa-one-icon-source.jpg'">
      </div>
      <h1 style="font-size: 26px; font-weight: 800; color: #eedab0; margin: 0 0 6px;">يافع ون | Yafa One</h1>
      <p style="font-size: 14px; color: #b8ded3; margin: 0 0 24px; font-weight: 500;">سوق يافع التجاري الشامل</p>
      <div style="width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #eedab0; border-radius: 50%; animation: yafa-spin 0.8s linear infinite;"></div>
    </div>
  </div>
  <script type="module" src="app.js"></script>
</body>
</html>
`
  fs.writeFileSync(path.join(rootDir, 'public', 'index.html'), htmlContent, 'utf-8')
  console.log('✔ Updated public/index.html with native standalone app loader')
}

buildStandalone().catch((err) => {
  console.error('Error during standalone build:', err)
  process.exit(1)
})
