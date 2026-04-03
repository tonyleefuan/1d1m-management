import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

/**
 * GET /api/sending/queue-summary
 *
 * 대기열 요약만 빠르게 반환 (PC별 상태 집계)
 * 전체 대기열 데이터를 가져오지 않아 응답 < 1KB
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') || todayKST()

  // 발송 설정 조회
  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['send_start_time', 'send_message_delay', 'send_file_delay', 'last_sheet_export_at', 'last_sheet_import_at'])

  const settings: Record<string, unknown> = {
    send_start_time: '04:00',
    send_message_delay: 3,
    send_file_delay: 6,
  }
  settingsData?.forEach(row => {
    const val = row.value
    settings[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : val
  })

  // DB 레벨 집계: device_id + status별 카운트
  const { data: counts, error } = await supabase
    .rpc('get_queue_summary', { p_date: date })

  if (error) {
    // RPC가 없으면 fallback: 페이지네이션으로 전체 조회
    const PAGE_SIZE = 1000
    const allRows: { device_id: string; status: string }[] = []
    let offset = 0

    while (true) {
      const { data: page, error: fbErr } = await supabase
        .from('send_queues')
        .select('device_id, status')
        .eq('send_date', date)
        .range(offset, offset + PAGE_SIZE - 1)

      if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 500 })
      if (!page || page.length === 0) break
      allRows.push(...page)
      if (page.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    // 인메모리 집계
    const summary: Record<string, { total: number; pending: number; sent: number; failed: number }> = {}
    let totalCount = 0
    allRows.forEach(item => {
      if (!summary[item.device_id]) {
        summary[item.device_id] = { total: 0, pending: 0, sent: 0, failed: 0 }
      }
      summary[item.device_id].total++
      summary[item.device_id][item.status as 'pending' | 'sent' | 'failed']++
      totalCount++
    })

    return NextResponse.json({ summary, settings, date, totalCount })
  }

  // RPC 결과를 summary 형태로 변환
  const summary: Record<string, { total: number; pending: number; sent: number; failed: number }> = {}
  let totalCount = 0
  ;(counts || []).forEach((row: { device_id: string; status: string; cnt: number }) => {
    if (!summary[row.device_id]) {
      summary[row.device_id] = { total: 0, pending: 0, sent: 0, failed: 0 }
    }
    summary[row.device_id].total += row.cnt
    summary[row.device_id][row.status as 'pending' | 'sent' | 'failed'] += row.cnt
    totalCount += row.cnt
  })

  return NextResponse.json({ summary, settings, date, totalCount })
}
