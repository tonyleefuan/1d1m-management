import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { readSheetData } from '@/lib/google-sheets'

// KST 오늘 날짜
function getKSTToday(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/**
 * 처리일시 파싱: "26.04.02 04:00:01" → "2026-04-02T04:00:01+09:00"
 */
function parseResultTime(timeStr: string): string | null {
  if (!timeStr || !timeStr.trim()) return null

  const trimmed = timeStr.trim()
  // 패턴: YY.MM.DD HH:MM:SS
  const match = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null

  const [, yy, mm, dd, hh, mi, ss] = match
  return `20${yy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`
}

/**
 * 처리결과 → status 매핑
 */
function mapResultStatus(result: string): 'sent' | 'failed' | null {
  const trimmed = (result || '').trim()
  if (trimmed === '성공') return 'sent'
  if (trimmed === '실패') return 'failed'
  return null
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const date = body.date || getKSTToday()

    // --- 활성 디바이스 조회 ---
    const { data: devices, error: devErr } = await supabase
      .from('send_devices')
      .select('id, phone_number, is_active')
      .eq('is_active', true)

    if (devErr) throw new Error(`디바이스 조회 실패: ${devErr.message}`)
    if (!devices?.length) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, skipped: 0, message: '활성 디바이스가 없습니다' })
    }

    // --- 시트에서 결과 읽기 ---
    interface QueueUpdate {
      id: string
      status: 'sent' | 'failed'
      sent_at: string | null
    }

    const updates: QueueUpdate[] = []
    let skipped = 0

    for (const device of devices) {
      let rows: string[][]
      try {
        rows = await readSheetData(device.phone_number)
      } catch {
        // 시트 탭이 없는 경우 건너뛰기
        continue
      }

      if (rows.length <= 1) continue // 헤더만 있는 경우

      // 첫 행은 헤더, 데이터는 1번째부터
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length < 7) continue

        const queueId = (row[6] || '').trim() // G열: queue_id
        const resultStr = (row[4] || '').trim() // E열: 처리결과
        const resultTimeStr = (row[5] || '').trim() // F열: 처리일시

        if (!queueId) continue

        const status = mapResultStatus(resultStr)
        if (!status) {
          skipped++
          continue
        }

        const sentAt = parseResultTime(resultTimeStr)
        updates.push({ id: queueId, status, sent_at: sentAt })
      }
    }

    if (!updates.length) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, skipped })
    }

    // --- send_queues 배치 업데이트 ---
    let sentCount = 0
    let failedCount = 0

    for (let i = 0; i < updates.length; i += 500) {
      const batch = updates.slice(i, i + 500)

      for (const item of batch) {
        const updateData: Record<string, unknown> = { status: item.status }
        if (item.sent_at) updateData.sent_at = item.sent_at
        if (item.status === 'failed') updateData.error_message = '수동 발송 실패'

        const { error } = await supabase
          .from('send_queues')
          .update(updateData)
          .eq('id', item.id)

        if (error) throw new Error(`대기열 업데이트 실패 (${item.id}): ${error.message}`)

        if (item.status === 'sent') sentCount++
        else failedCount++
      }
    }

    // --- 구독 상태 업데이트 ---
    // 업데이트된 큐 항목의 subscription 정보 조회
    const updatedIds = updates.map(u => u.id)
    const { data: updatedQueues, error: fetchErr } = await supabase
      .from('send_queues')
      .select('id, subscription_id, day_number, status, send_date')
      .in('id', updatedIds)

    if (fetchErr) throw new Error(`업데이트된 큐 조회 실패: ${fetchErr.message}`)

    // subscription_id + day_number 별 그룹화
    const subDayGroups = new Map<string, { statuses: string[]; subscriptionId: string; dayNumber: number; sendDate: string }>()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars

    for (const q of updatedQueues || []) {
      if (!q.subscription_id || !q.day_number) continue
      const key = `${q.subscription_id}:${q.day_number}`
      const existing = subDayGroups.get(key)
      if (existing) {
        existing.statuses.push(q.status)
      } else {
        subDayGroups.set(key, {
          statuses: [q.status],
          subscriptionId: q.subscription_id,
          dayNumber: q.day_number,
          sendDate: q.send_date,
        })
      }
    }

    // 해당 subscription+day의 전체 큐 상태도 확인 (시트에 안 적힌 것도 있을 수 있음)
    for (const [key, group] of subDayGroups) {
      const { data: allItems } = await supabase
        .from('send_queues')
        .select('status')
        .eq('subscription_id', group.subscriptionId)
        .eq('day_number', group.dayNumber)
        .eq('send_date', group.sendDate)

      if (!allItems) continue

      const allStatuses = allItems.map(i => i.status)

      // pending이 남아있으면 아직 판단하지 않음
      if (allStatuses.includes('pending')) continue

      // 하나라도 failed면 실패 처리
      if (allStatuses.includes('failed')) {
        await supabase
          .from('subscriptions')
          .update({
            failure_type: 'failed',
            failure_date: group.sendDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', group.subscriptionId)
        continue
      }

      // 모두 sent면 성공 처리
      if (allStatuses.every(s => s === 'sent')) {
        // last_sent_day 조회
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('last_sent_day')
          .eq('id', group.subscriptionId)
          .single()

        if (sub && group.dayNumber === sub.last_sent_day + 1) {
          await supabase
            .from('subscriptions')
            .update({
              last_sent_day: group.dayNumber,
              updated_at: new Date().toISOString(),
            })
            .eq('id', group.subscriptionId)
        }
      }
    }

    // --- app_settings 업데이트 ---
    const now = new Date().toISOString()
    await supabase.from('app_settings').upsert({
      key: 'last_sheet_import_at',
      value: JSON.stringify(now),
      updated_at: now,
    })

    return NextResponse.json({
      ok: true,
      processed: updates.length,
      sent: sentCount,
      failed: failedCount,
      skipped,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '결과 가져오기 중 오류가 발생했습니다' }, { status: 500 })
  }
}
