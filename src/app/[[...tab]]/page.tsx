import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Dashboard } from '@/components/Dashboard'
import { TABS } from '@/lib/constants'

// cs는 app/cs/ 라우트가 별도 존재하므로 catch-all에서 제외
const VALID_TAB_IDS = new Set(TABS.filter(t => t.id !== 'cs').map(t => t.id))

interface Props {
  params: Promise<{ tab?: string[] }>
}

export default async function HomePage({ params }: Props) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { tab } = await params
  const tabId = tab?.[0] ?? null

  // 유효하지 않은 탭 경로 → 루트로 리다이렉트
  if (tabId && !VALID_TAB_IDS.has(tabId)) {
    redirect('/')
  }

  return (
    <Dashboard
      userName={session.username}
      userRole={session.role}
      initialTab={tabId}
    />
  )
}
