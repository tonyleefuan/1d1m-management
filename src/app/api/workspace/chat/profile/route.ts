import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const PROFILES: Record<string, object> = {
  subscriptions: {
    id: 'sub-assistant',
    name: '구독 관리 어시스턴트',
    tab_id: 'subscriptions',
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    starters: [
      { label: '📋 특정 고객 구독 조회', message: '이연우 고객의 구독 현황을 알려줘' },
      { label: '🔄 PC 배정 변경', message: 'SUB-46 상품 구독자 중 미배정인 것들을 PC 3에 배정해줘' },
      { label: '📊 발송 현황 요약', message: '오늘 발송 현황을 요약해줘' },
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
