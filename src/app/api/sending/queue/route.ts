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

  // 쿼리 빌드
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

  const { data, error, count } = await query
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
