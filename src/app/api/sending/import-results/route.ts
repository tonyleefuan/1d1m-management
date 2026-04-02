import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { readSheetData } from '@/lib/google-sheets'

// KST 오늘 날짜
function getKSTToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

/**
 * 처리일시 파싱: "26.04.02 04:00:01" → "2026-04-02T04:00:01+09:00"
 */
function parseResultTime(timeStr: string): string | null {
  if (!timeStr || !timeStr.trim()) return null

  const trimmed = timeStr.trim()
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

    // --- 시트에서 결과 읽기 + 중복 제거 ---
    const updateMap = new Map<string, { id: string; status: 'sent' | 'failed'; sent_at: string | null }>()
    let skipped = 0

    for (const device of devices) {
      let rows: string[][]
      try {
        rows = await readSheetData(device.phone_number)
      } catch {
        continue
      }

      if (rows.length <= 1) continue

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length < 7) continue

        const queueId = (row[6] || '').trim()
        const resultStr = (row[4] || '').trim()
        const resultTimeStr = (row[5] || '').trim()

        if (!queueId) continue

        const status = mapResultStatus(resultStr)
        if (!status) {
          skipped++
          continue
        }

        // 중복 queue_id 방지 (첫 번째 것만 사용)
        if (!updateMap.has(queueId)) {
          updateMap.set(queueId, { id: queueId, status, sent_at: parseResultTime(resultTimeStr) })
        }
      }
    }

    const updates = [...updateMap.values()]
    if (!updates.length) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, skipped })
    }

    // --- send_queues 배치 업데이트 (upsert로 N+1 방지) ---
    let sentCount = 0
    let failedCount = 0

    // status별로 그룹화하여 배치 처리
    const sentUpdates = updates.filter(u => u.status === 'sent')
    const failedUpdates = updates.filter(u => u.status === 'failed')

    // 성공 건: sent_at이 각각 다르므로 개별 처리하되 pending인 것만
    for (let i = 0; i < sentUpdates.length; i += 500) {
      const batch = sentUpdates.slice(i, i + 500)
      for (const item of batch) {
        const { error, count } = await supabase
          .from('send_queues')
          .update({ status: 'sent', sent_at: item.sent_at })
          .eq('id', item.id)
          .eq('status', 'pending')  // 멱등성: 이미 처리된 행은 건너뜀

        if (error) throw new Error(`대기열 업데이트 실패 (${item.id}): ${error.message}`)
        if (count && count > 0) sentCount++
      }
    }

    // 실패 건
    for (let i = 0; i < failedUpdates.length; i += 500) {
      const batch = failedUpdates.slice(i, i + 500)
      for (const item of batch) {
        const { error, count } = await supabase
          .from('send_queues')
          .update({ status: 'failed', sent_at: item.sent_at, error_message: '수동 발송 실패' })
          .eq('id', item.id)
          .eq('status', 'pending')  // 멱등성

        if (error) throw new Error(`대기열 업데이트 실패 (${item.id}): ${error.message}`)
        if (count && count > 0) failedCount++
      }
    }

    // --- 구독 상태 업데이트 (N+1 방지: 한 번에 조회) ---
    const allUpdateIds = updates.map(u => u.id)

    // 1) 업데이트된 큐의 subscription 정보 조회 (한 번에)
    const { data: updatedQueues, error: fetchErr } = await supabase
      .from('send_queues')
      .select('id, subscription_id, day_number, status, send_date')
      .in('id', allUpdateIds)

    if (fetchErr) throw new Error(`업데이트된 큐 조회 실패: ${fetchErr.message}`)

    // 2) subscription_id + day_number 그룹화
    const subDayGroups = new Map<string, { subscriptionId: string; dayNumber: number; sendDate: string }>()
    for (const q of updatedQueues || []) {
      if (!q.subscription_id || !q.day_number) continue
      const key = `${q.subscription_id}:${q.day_number}`
      if (!subDayGroups.has(key)) {
        subDayGroups.set(key, {
          subscriptionId: q.subscription_id,
          dayNumber: q.day_number,
          sendDate: q.send_date,
        })
      }
    }

    if (subDayGroups.size === 0) {
      const now = new Date().toISOString()
      await supabase.from('app_settings').upsert({ key: 'last_sheet_import_at', value: JSON.stringify(now), updated_at: now })
      return NextResponse.json({ ok: true, processed: sentCount + failedCount, sent: sentCount, failed: failedCount, skipped })
    }

    // 3) 영향받은 subscription의 전체 큐 상태를 한 번에 조회
    const affectedSubIds = [...new Set([...subDayGroups.values()].map(g => g.subscriptionId))]
    const { data: allSubQueues } = await supabase
      .from('send_queues')
      .select('subscription_id, day_number, send_date, status')
      .in('subscription_id', affectedSubIds)
      .eq('send_date', date)

    // 4) subscription+day별 전체 상태 맵 구성
    const fullStatusMap = new Map<string, string[]>()
    for (const q of allSubQueues || []) {
      if (!q.day_number) continue
      const key = `${q.subscription_id}:${q.day_number}`
      const arr = fullStatusMap.get(key) || []
      arr.push(q.status)
      fullStatusMap.set(key, arr)
    }

    // 5) 영향받은 subscription의 last_sent_day를 한 번에 조회
    const { data: subData } = await supabase
      .from('subscriptions')
      .select('id, last_sent_day')
      .in('id', affectedSubIds)

    const lastSentDayMap = new Map<string, number>()
    for (const s of subData || []) {
      lastSentDayMap.set(s.id, s.last_sent_day ?? 0)
    }

    // 6) 구독 상태 업데이트 (DB 조회 없이 인메모리 판단)
    const now = new Date().toISOString()

    for (const [key, group] of subDayGroups) {
      const allStatuses = fullStatusMap.get(key)
      if (!allStatuses) continue

      // pending이 남아있으면 판단 보류
      if (allStatuses.includes('pending')) continue

      // 하나라도 failed면 실패 처리
      if (allStatuses.includes('failed')) {
        await supabase
          .from('subscriptions')
          .update({ failure_type: 'failed', failure_date: group.sendDate, updated_at: now })
          .eq('id', group.subscriptionId)
        continue
      }

      // 모두 sent면 성공 처리
      if (allStatuses.every(s => s === 'sent')) {
        const lastSentDay = lastSentDayMap.get(group.subscriptionId) ?? 0
        if (group.dayNumber === lastSentDay + 1) {
          await supabase
            .from('subscriptions')
            .update({ last_sent_day: group.dayNumber, failure_type: null, failure_date: null, updated_at: now })
            .eq('id', group.subscriptionId)
          // 인메모리 맵도 업데이트 (같은 구독의 다른 Day 처리 시 필요)
          lastSentDayMap.set(group.subscriptionId, group.dayNumber)
        }
      }
    }

    // --- app_settings 업데이트 ---
    await supabase.from('app_settings').upsert({ key: 'last_sheet_import_at', value: JSON.stringify(now), updated_at: now })

    return NextResponse.json({
      ok: true,
      processed: sentCount + failedCount,
      sent: sentCount,
      failed: failedCount,
      skipped,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '결과 가져오기 중 오류가 발생했습니다' }, { status: 500 })
  }
}
