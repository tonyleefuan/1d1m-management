export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { querySendHistory, detectAnomalies } from '@/lib/send-history'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const subscriptionId = searchParams.get('subscription_id')
  const search = searchParams.get('search')
  const days = Math.min(30, Math.max(1, Number(searchParams.get('days')) || 14))

  // ── 검색 모드: 고객명/전화번호로 구독 목록 반환 ──
  if (search) {
    const trimmed = search.trim()
    let query = supabase
      .from('subscriptions')
      .select('id, status, last_sent_day, duration_days, start_date, customer:customers(id, name, kakao_friend_name, phone_last4), product:products(title)')
      .in('status', ['live', 'pause', 'pending'])
      .order('created_at', { ascending: false })
      .limit(20)

    // 숫자 4자리면 phone_last4, 아니면 이름 검색
    if (/^\d{4}$/.test(trimmed)) {
      query = query.eq('customer.phone_last4', trimmed)
    } else {
      query = query.or(`name.ilike.%${trimmed}%,kakao_friend_name.ilike.%${trimmed}%`, { referencedTable: 'customers' })
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // customer join이 null인 행 제거 (검색 조건 불일치)
    const filtered = (data || []).filter((s: any) => s.customer !== null)
    return NextResponse.json({ data: filtered })
  }

  // ── 발송 이력 모드: subscription_id 필수 ──
  if (!subscriptionId) {
    return NextResponse.json({ error: 'subscription_id 또는 search 파라미터가 필요합니다.' }, { status: 400 })
  }

  const today = new Date()
  const from = new Date(today)
  from.setDate(from.getDate() - days)
  const fromDate = from.toISOString().slice(0, 10)
  const toDate = today.toISOString().slice(0, 10)

  const { data: entries, error } = await querySendHistory(subscriptionId, fromDate, toDate)
  if (error || !entries) return NextResponse.json({ error: error || '조회 실패' }, { status: 500 })

  const anomalies = detectAnomalies(entries)

  return NextResponse.json({ data: { entries, anomalies, from_date: fromDate, to_date: toDate } })
}
