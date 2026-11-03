'use client'

export default function imageLoader({ quality, src, width }: { quality?: number; src: string; width: number }) {
  if (!src.startsWith('/api/') && !src.includes('/api/')) {
    return src
  }
  const [pathname, search = ''] = src.split('?')
  const searchParams = new URLSearchParams(search)
  searchParams.set('w', String(width))
  if (quality !== undefined) {
    searchParams.set('q', String(quality))
  }
  return `${pathname}?${searchParams}`
}
