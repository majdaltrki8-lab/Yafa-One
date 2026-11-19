import path from 'path'
import { buildConfig } from 'payload'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { en as adminLanguage } from '@payloadcms/translations/languages/en'
import { fileURLToPath } from 'url'
import { Admins } from './collections/Admins'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { Tags } from './collections/Tags'
import { Posts } from './collections/Posts'
import { yafaCollections } from './collections/YafaAdmin'
import { SystemSettings } from './globals/SystemSettings'
import { mockDatabaseAdapter } from './lib/mock-db-adapter'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

import crypto from 'crypto'

function getPayloadSecret(): string {
  const envSecret = process.env.PAYLOAD_SECRET || process.env.SESSION_SECRET
  if (envSecret && envSecret.length >= 16) return envSecret
  const g = globalThis as typeof globalThis & { __yafaPayloadSecret?: string }
  if (!g.__yafaPayloadSecret) {
    g.__yafaPayloadSecret = crypto.randomBytes(32).toString('hex')
  }
  return g.__yafaPayloadSecret
}

export default buildConfig({
  secret: getPayloadSecret(),
  db: mockDatabaseAdapter(),
  editor: lexicalEditor(),
  admin: {
    user: Admins.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { 'en': adminLanguage },
  },
  collections: [Admins, Media, Folders, Tags, Posts, ...yafaCollections],
  globals: [SystemSettings],
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  plugins: [mcpPlugin({})],
})
