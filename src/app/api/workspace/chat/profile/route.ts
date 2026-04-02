import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const PROFILES: Record<string, object> = {
  subscriptions: {
    id: 'sub-assistant',
    name: '구독 관리 어시스턴트',
    tab_id: 'subscriptions',
    model: 'claude-haiku-4-6',
    max_tokens: 2048,
    starters: [
      { label: '📋 고객 구독 조회', message: '특정 고객의 구독 현황을 조회하고 싶어' },
      { label: '✏️ 고객 정보 변경', message: '특정 고객의 정보를 변경하고 싶어' },
      { label: '🔄 PC 배정 변경', message: '특정 상품의 구독자들을 다른 PC로 배정하고 싶어' },
    ],
  },
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tabId = searchParams.get('tab_id') || ''

  const profile = PROFILES[tabId]
  if (!profile) return NextResponse.json({ profile: null })

  return NextResponse.json({ profile })
}
