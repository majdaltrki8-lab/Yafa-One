import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const sourceIconPath = path.join(process.cwd(), 'public', 'assets', 'aistudio', 'file_0000000007288208a6004fdc6e9447ff_d4d60dcb.jpg')
const androidResDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res')

if (!fs.existsSync(sourceIconPath)) {
  console.error('Source icon not found at:', sourceIconPath)
  process.exit(1)
}

if (!fs.existsSync(androidResDir)) {
  console.log('Android res directory not found yet. Skipping until Capacitor add android runs.')
  process.exit(0)
}

// 1. Density definitions for Mipmap Icons
const iconDensities = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 },
]

// 2. Splash Screen definitions (Portrait, Landscape, and Default)
const splashTargets = [
  { dir: 'drawable', width: 480, height: 320 },
  // Portrait
  { dir: 'drawable-port-mdpi', width: 320, height: 480 },
  { dir: 'drawable-port-hdpi', width: 480, height: 800 },
  { dir: 'drawable-port-xhdpi', width: 720, height: 1280 },
  { dir: 'drawable-port-xxhdpi', width: 960, height: 1600 },
  { dir: 'drawable-port-xxxhdpi', width: 1280, height: 1920 },
  // Landscape
  { dir: 'drawable-land-mdpi', width: 480, height: 320 },
  { dir: 'drawable-land-hdpi', width: 800, height: 480 },
  { dir: 'drawable-land-xhdpi', width: 1280, height: 720 },
  { dir: 'drawable-land-xxhdpi', width: 1600, height: 960 },
  { dir: 'drawable-land-xxxhdpi', width: 1920, height: 1280 },
]

async function generateAll() {
  console.log('Starting Yafa One Android Assets Generation...')
  console.log('Using official logo source:', sourceIconPath)

  // A. Generate Mipmap Icons
  for (const density of iconDensities) {
    const dir = path.join(androidResDir, density.name)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    // Square launcher icon
    await sharp(sourceIconPath)
      .resize(density.size, density.size)
      .toFile(path.join(dir, 'ic_launcher.png'))

    // Round launcher icon
    await sharp(sourceIconPath)
      .resize(density.size, density.size)
      .composite([{
        input: Buffer.from(
          `<svg><circle cx="${density.size / 2}" cy="${density.size / 2}" r="${density.size / 2}" fill="#FFF"/></svg>`
        ),
        blend: 'dest-in'
      }])
      .toFile(path.join(dir, 'ic_launcher_round.png'))

    // Foreground icon for adaptive icons (padded slightly to fit circular/squircle mask)
    const fgBadgeSize = Math.round(density.size * 0.72)
    const fgPadding = Math.round((density.size - fgBadgeSize) / 2)
    const resizedBadge = await sharp(sourceIconPath)
      .resize(fgBadgeSize, fgBadgeSize)
      .toBuffer()

    await sharp({
      create: {
        width: density.size,
        height: density.size,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: resizedBadge, left: fgPadding, top: fgPadding }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'))

    console.log(`Generated launcher icons for ${density.name} (${density.size}x${density.size})`)
  }

  // B. Generate Adaptive Icon XMLs
  const anydpiDir = path.join(androidResDir, 'mipmap-anydpi-v26')
  if (!fs.existsSync(anydpiDir)) {
    fs.mkdirSync(anydpiDir, { recursive: true })
  }

  const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher.xml'), adaptiveIconXml, 'utf-8')
  fs.writeFileSync(path.join(anydpiDir, 'ic_launcher_round.xml'), adaptiveIconXml, 'utf-8')

  // C. Generate Colors XML
  const valuesDir = path.join(androidResDir, 'values')
  if (!fs.existsSync(valuesDir)) {
    fs.mkdirSync(valuesDir, { recursive: true })
  }
  const colorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#064b3d</color>
    <color name="colorPrimaryDark">#043329</color>
    <color name="colorAccent">#eedab0</color>
    <color name="ic_launcher_background">#064b3d</color>
</resources>
`
  fs.writeFileSync(path.join(valuesDir, 'colors.xml'), colorsXml, 'utf-8')

  // Remove duplicate values/ic_launcher_background.xml to avoid mergeDebugResources conflict
  const duplicateValuesBg = path.join(valuesDir, 'ic_launcher_background.xml')
  if (fs.existsSync(duplicateValuesBg)) {
    fs.unlinkSync(duplicateValuesBg)
    console.log('Removed duplicate values/ic_launcher_background.xml to prevent resource collision with colors.xml')
  }

  // D. Clean up any leftover default template vectors in drawable
  const duplicateDrawableBg = path.join(androidResDir, 'drawable', 'ic_launcher_background.xml')
  if (fs.existsSync(duplicateDrawableBg)) {
    fs.unlinkSync(duplicateDrawableBg)
    console.log('Removed obsolete drawable/ic_launcher_background.xml')
  }

  const v24Foreground = path.join(androidResDir, 'drawable-v24', 'ic_launcher_foreground.xml')
  if (fs.existsSync(v24Foreground)) {
    fs.unlinkSync(v24Foreground)
    console.log('Removed obsolete template drawable-v24/ic_launcher_foreground.xml')
  }

  // E. Generate Official Yafa One Splash Screens across all resolutions
  console.log('Generating official Yafa One splash screens (replacing default Google AI Studio splash)...')
  for (const target of splashTargets) {
    const targetDir = path.join(androidResDir, target.dir)
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const { width, height } = target
    // Badge takes ~48% of the minimum screen dimension for balanced presentation
    const badgeSize = Math.round(Math.min(width, height) * 0.48)
    const left = Math.round((width - badgeSize) / 2)
    const top = Math.round((height - badgeSize) / 2)

    const badgeBuffer = await sharp(sourceIconPath)
      .resize(badgeSize, badgeSize, { fit: 'inside' })
      .toBuffer()

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 6, g: 75, b: 61, alpha: 1 } // #064b3d Yafa One Dark Emerald
      }
    })
      .composite([{ input: badgeBuffer, left, top }])
      .png()
      .toFile(path.join(targetDir, 'splash.png'))

    console.log(`Generated splash for ${target.dir} (${width}x${height})`)
  }

  // F. Ensure AndroidManifest.xml has correct launcher icon references
  const manifestPath = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'AndroidManifest.xml')
  if (fs.existsSync(manifestPath)) {
    let manifestContent = fs.readFileSync(manifestPath, 'utf-8')
    if (!manifestContent.includes('android:icon="@mipmap/ic_launcher"')) {
      manifestContent = manifestContent.replace(
        '<application',
        '<application android:icon="@mipmap/ic_launcher" android:roundIcon="@mipmap/ic_launcher_round"'
      )
      fs.writeFileSync(manifestPath, manifestContent, 'utf-8')
      console.log('Updated AndroidManifest.xml with mipmap launcher icons.')
    }
  }

  // G. Bump or maintain versionCode in build.gradle
  const buildGradlePath = path.join(process.cwd(), 'android', 'app', 'build.gradle')
  if (fs.existsSync(buildGradlePath)) {
    let gradleContent = fs.readFileSync(buildGradlePath, 'utf-8')
    gradleContent = gradleContent.replace(/versionCode\s+(\d+)/, (match, p1) => {
      const nextCode = Number(p1) + 1
      console.log(`Bumping versionCode from ${p1} to ${nextCode}`)
      return `versionCode ${nextCode}`
    })
    fs.writeFileSync(buildGradlePath, gradleContent, 'utf-8')
  }

  console.log('Official Yafa One Android icons and splash screens successfully generated!')
}

generateAll().catch(err => {
  console.error('Error generating Android assets:', err)
  process.exit(1)
})
