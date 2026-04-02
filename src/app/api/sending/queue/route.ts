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

  // 대기열 조회
  let query = supabase
    .from('send_queues')
    .select(`
      *,
      subscription:subscriptions(
        id, day, duration_days, send_priority,
        product:products(sku_code, title)
      )
    `)
    .eq('send_date', date)
    .order('sort_order', { ascending: true })

  if (deviceId) query = query.eq('device_id', deviceId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 예상 시간 계산
  const startTime = String(settings.send_start_time)
  const msgDelay = Number(settings.send_message_delay) || 3
  const fileDelay = Number(settings.send_file_delay) || 6
  const [startH, startM] = startTime.split(':').map(Number)
  const baseSeconds = startH * 3600 + startM * 60

  // PC별로 순서 카운트해서 예상 시간 계산
  const deviceCounters = new Map<string, number>()
  const enriched = data?.map(item => {
    const deviceSeq = deviceCounters.get(item.device_id) || 0
    const delay = item.image_path ? fileDelay : msgDelay
    const elapsedSeconds = deviceSeq > 0 ? deviceSeq * delay : 0
    const estimatedSeconds = baseSeconds + elapsedSeconds
    const h = Math.floor(estimatedSeconds / 3600) % 24
    const m = Math.floor((estimatedSeconds % 3600) / 60)
    const s = estimatedSeconds % 60
    const estimated_time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

    deviceCounters.set(item.device_id, deviceSeq + 1)

    return { ...item, estimated_time }
  })

  // PC별 요약
  const summary: Record<string, { total: number; pending: number; sent: number; failed: number }> = {}
  data?.forEach(item => {
    if (!summary[item.device_id]) {
      summary[item.device_id] = { total: 0, pending: 0, sent: 0, failed: 0 }
    }
    summary[item.device_id].total++
    summary[item.device_id][item.status as 'pending' | 'sent' | 'failed']++
  })

  return NextResponse.json({
    data: enriched,
    summary,
    settings,
    date,
  })
}
