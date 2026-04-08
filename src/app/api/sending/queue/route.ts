export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('device_id') || ''
  const date = searchParams.get('date') || todayKST()
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const unresolved = searchParams.get('unresolved') === 'true'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 100))

  // 발송 설정 조회 (예상 시간 계산용)
  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['send_start_time', 'send_message_delay', 'send_file_delay'])

  const settings: Record<string, unknown> = {
    send_start_time: '04:00',
    send_message_delay: 3,
    send_file_delay: 6,
  }
  settingsData?.forEach(row => {
    const val = row.value
    settings[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : val
  })

  // 페이지네이션 계산
  const from = (page - 1) * limit
  const to = from + limit - 1

  let data: any[] | null = null
  let error: any = null
  let count: number | null = null

  if (unresolved && status === 'failed') {
    // ─── 미해결 실패 조회: 날짜 무관, 아직 재발송 성공 안 된 failed 큐만 ───
    const { data: failedData, error: failedErr, count: failedCount } = await supabase
      .from('send_queues')
      .select(`
        *,
        subscription:subscriptions(
          id, day, duration_days, send_priority,
          product:products(sku_code, title)
        )
      `, { count: 'exact' })
      .eq('status', 'failed')
      .eq('is_notice', false)
      .order('send_date', { ascending: false })
      .order('sort_order', { ascending: true })
      .range(from, to)

    if (failedErr) return NextResponse.json({ error: failedErr.message }, { status: 500 })

    // 해결된 실패 제외: 같은 subscription_id+day_number에 sent 큐가 있으면 제외
    if (failedData?.length) {
      const subDayKeys = [...new Set(failedData.map(q => `${q.subscription_id}:${q.day_number}`))]
      const subIds = [...new Set(failedData.map(q => q.subscription_id))]

      // sent 큐 조회
      const resolvedKeys = new Set<string>()
      for (let i = 0; i < subIds.length; i += 100) {
        const batch = subIds.slice(i, i + 100)
        const { data: sentData } = await supabase
          .from('send_queues')
          .select('subscription_id, day_number')
          .in('subscription_id', batch)
          .eq('status', 'sent')
          .eq('is_notice', false)
        sentData?.forEach(s => resolvedKeys.add(`${s.subscription_id}:${s.day_number}`))
      }

      data = failedData.filter(q => !resolvedKeys.has(`${q.subscription_id}:${q.day_number}`))
      count = data.length
      // Note: count는 이 페이지 내 필터 결과라 정확한 total이 아닐 수 있음
      // 실패 건이 수백 건 이상이면 RPC로 전환 필요
    } else {
      data = []
      count = 0
    }
    error = null
  } else {
    // ─── 기본 조회: 날짜별 큐 ───
    let query = supabase
      .from('send_queues')
      .select(`
        *,
        subscription:subscriptions(
          id, day, duration_days, send_priority,
          product:products(sku_code, title)
        )
      `, { count: 'exact' })
      .eq('send_date', date)
      .order('sort_order', { ascending: true })
      .range(from, to)

    if (deviceId) query = query.eq('device_id', deviceId)
    if (status) query = query.eq('status', status)
    if (search) query = query.ilike('kakao_friend_name', `%${search}%`)

    const result = await query
    data = result.data
    error = result.error
    count = result.count
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 예상 시간 계산 (이 페이지 항목만)
  const startTime = String(settings.send_start_time)
  const msgDelay = Number(settings.send_message_delay) || 3
  const fileDelay = Number(settings.send_file_delay) || 6
  const [startH, startM] = startTime.split(':').map(Number)
  const baseSeconds = startH * 3600 + startM * 60

  const enriched = data?.map(item => {
    // sort_order 기반으로 예상 시간 계산 (sort_order는 전체 순서)
    const delay = item.image_path ? fileDelay : msgDelay
    const elapsedSeconds = (item.sort_order - 1) * delay
    const estimatedSeconds = baseSeconds + elapsedSeconds
    const h = Math.floor(estimatedSeconds / 3600) % 24
    const m = Math.floor((estimatedSeconds % 3600) / 60)
    const s = estimatedSeconds % 60
    const estimated_time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

    return { ...item, estimated_time }
  })

  return NextResponse.json({
    data: enriched,
    settings,
    date,
    pagination: {
      page,
      limit,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / limit),
    },
  })
}
