import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const getOriginHosts = (): string[] => {
  const hosts: string[] = []
  const candidates = [
    process.env.APP_URL,
    process.env.FIGMA_PUBLIC_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NG_ALLOWED_HOSTS,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
        const host = new URL(candidate).host
        if (host && !hosts.includes(host)) hosts.push(host)
      } else {
        if (!hosts.includes(candidate)) hosts.push(candidate)
      }
    } catch {
      // ignore invalid URLs
    }
  }

  // Support wildcard cloud run domain for Google AI Studio preview iframe
  if (!hosts.includes('*.run.app')) {
    hosts.push('*.run.app')
  }

  return hosts
}

const previewOrigins = getOriginHosts()

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    loader: 'custom',
    loaderFile: './figma-image-loader.ts',
  },
  // Don't block publishing or preview deploys on errors if the emitted JS is valid
  typescript: {
    ignoreBuildErrors: true,
  },
  // Next blocks its dev resources unless the preview origin is listed here.
  allowedDevOrigins: previewOrigins,
  // Prerender source maps add ~100 MB per static build worker
  enablePrerenderSourceMaps: false,
  experimental: {
    // Caps static build workers to lower next build peak memory
    cpus: 1,
    serverActions: {
      allowedOrigins: previewOrigins,
    },
  },
  env: {
    NEXT_PUBLIC_SITE_URL:
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.FIGMA_PUBLIC_URL ||
      'https://ais-dev-wyfhgmprvy5tciy3ynscos-623825382652.europe-west1.run.app',
    // NOTE: Secrets like PAYLOAD_SECRET are server-only and should NOT be placed
    // in `env` here, to prevent inlining secrets into the browser JS bundle.
    // Server-side code reads `process.env.PAYLOAD_SECRET` directly from the environment.
    // or any other credential here. Values placed in `env` are inlined into
    // the JavaScript bundle by Next.js at build time and become readable by
    // anyone who can load the app's client assets. Server-side code
    // (payload.config.ts, route handlers, server components) can still read
    // these values from `process.env.*` without declaring them here. Only
    // public, non-secret values that explicitly need to be available in
    // browser code should be added - and those should use the `NEXT_PUBLIC_*`
    // naming convention.
    FIGMA_CONTENT_API_CONTENT_SYSTEM_ID: process.env.FIGMA_CONTENT_API_CONTENT_SYSTEM_ID,
    FIGMA_CONTENT_API_URL: process.env.FIGMA_CONTENT_API_URL,
    FIGMA_OAUTH_CLIENT_ID: process.env.FIGMA_OAUTH_CLIENT_ID,
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
