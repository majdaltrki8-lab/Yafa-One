import LegacyRoot from '@/components/LegacyRoot'
import { notFound } from 'next/navigation'

const validAuthActions = new Set([
  'visitor-login',
  'owner-login',
  'admin-login',
])

export default async function AuthActionPage({
  params,
}: {
  params: Promise<{ action: string }>
}) {
  const { action } = await params
  if (!validAuthActions.has(action)) {
    notFound()
  }
  return <LegacyRoot />
}
