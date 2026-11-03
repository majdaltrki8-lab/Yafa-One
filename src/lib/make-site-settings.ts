export type MakeSiteSettings = {
  title?: string
  description?: string
  language?: string
  robots?: {
    index?: boolean
  }
  icons?: {
    icon?: string
  }
  openGraph?: {
    image?: string
  }
  analytics?: {
    googleAnalyticsId?: string
  }
  customScripts?: {
    headStart?: string
    headEnd?: string
    bodyStart?: string
    bodyEnd?: string
  }
  accessibility?: {
    addBypassLinks?: boolean
  }
}

export const makeSiteSettings: MakeSiteSettings = {
  title: "يافع ون | Yafa One",
  description: "سوق وخدمات يافع في منصة واحدة",
  language: "ar",
  icons: {
    icon: "/icons/icon-512.png",
  },
  openGraph: {
    image: "/icons/google-play-512.png",
  },
}

export function sanitizeHtmlAttribute(value: string | undefined): string {
  return value?.replace(/[^a-zA-Z0-9_-]/g, '') || ''
}

