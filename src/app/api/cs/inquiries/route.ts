import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCsSession } from '@/lib/cs-auth'
import { CS_CATEGORY_LABELS } from '@/lib/constants'

const VALID_CATEGORIES = ['message_not_received', 'pause_resume', 'product_change', 'cancel_refund', 'other']

export async function GET() {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('cs_inquiries')
    .select('*, cs_replies(id)')
    .eq('customer_id', session.customerId)
    .neq('status', 'closed')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = data?.map(inq => ({
    ...inq,
    reply_count: inq.cs_replies?.length ?? 0,
    cs_replies: undefined,
  }))

  return NextResponse.json({ data: enriched })
}

export async function POST(req: Request) {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { category, content, subscriptionId } = await req.json()

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: '카테고리를 선택해 주세요.' }, { status: 400 })
    }
    if (!content?.trim()) {
      return NextResponse.json({ error: '내용을 입력해 주세요.' }, { status: 400 })
    }
    if (content.trim().length > 2000) {
      return NextResponse.json({ error: '내용은 2000자 이내로 입력해 주세요.' }, { status: 400 })
    }

    // Rate limit: 20 inquiries per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('cs_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', session.customerId)
      .eq('action', 'inquiry')
      .gte('attempted_at', oneHourAgo)

    if ((count ?? 0) >= 20) {
      return NextResponse.json({ error: '문의 등록 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
    }

    await supabase.from('cs_rate_limits').insert({
      identifier: session.customerId,
      action: 'inquiry',
    })

    if (subscriptionId) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('id', subscriptionId)
        .eq('customer_id', session.customerId)
        .single()
      if (!sub) {
        return NextResponse.json({ error: '유효하지 않은 구독입니다.' }, { status: 400 })
      }
    }

    const { data: inquiry, error } = await supabase
      .from('cs_inquiries')
      .insert({
        customer_id: session.customerId,
        category,
        title: `${CS_CATEGORY_LABELS[category] || category} 문의`,
        content: content.trim(),
        subscription_id: subscriptionId || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // AI 응답은 Cron(/api/cron/cs-reply)이 주기적으로 처리
    // 문의는 pending 상태로 즉시 반환, 고객은 상세 페이지에서 폴링으로 결과 확인
    return NextResponse.json({ data: inquiry }, { status: 201 })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
