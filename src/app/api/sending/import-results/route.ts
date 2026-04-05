import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'
import { readSheetData } from '@/lib/google-sheets'

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
  if (!trimmed) return null  // 공백 = 아직 처리 안 됨 (skip)
  if (trimmed === '성공') return 'sent'
  return 'failed'  // 성공이 아닌 모든 값은 실패
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const date = body.date || todayKST()

  // SSE 스트리밍 여부
  const useStream = body.stream === true

  if (useStream) {
    return streamImport(date)
  }

  // 기존 방식 (하위 호환)
  return batchImport(date)
}

// ─── SSE 스트리밍 방식 ─────────────────────────────────────

async function streamImport(date: string) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // 활성 디바이스 조회
        const { data: devices, error: devErr } = await supabase
          .from('send_devices')
          .select('id, phone_number, name, is_active')
          .eq('is_active', true)

        if (devErr) throw new Error(`디바이스 조회 실패: ${devErr.message}`)
        if (!devices?.length) {
          send({ type: 'complete', processed: 0, sent: 0, failed: 0, skipped: 0, message: '활성 디바이스가 없습니다' })
          controller.close()
          return
        }

        send({ type: 'start', totalDevices: devices.length })

        const updateMap = new Map<string, { id: string; status: 'sent' | 'failed'; sent_at: string | null }>()
        let skipped = 0

        // PC별로 시트 병렬 읽기 + 진행 상황 전송
        const PARALLEL_BATCH = 5 // 동시 5개씩
        for (let batch = 0; batch < devices.length; batch += PARALLEL_BATCH) {
          const chunk = devices.slice(batch, batch + PARALLEL_BATCH)

          // 배치 내 병렬 실행
          const promises = chunk.map(async (device, j) => {
            const i = batch + j
            const deviceLabel = device.name || device.phone_number
            send({ type: 'device_start', index: i, total: devices.length, phone: device.phone_number, name: deviceLabel })

            try {
              const rows = await readSheetData(device.phone_number)
              let deviceRows = 0
              if (rows.length > 1) {
                for (let r = 1; r < rows.length; r++) {
                  const row = rows[r]
                  if (!row || row.length < 7) continue
                  const queueId = (row[6] || '').trim()
                  const resultStr = (row[4] || '').trim()
                  const resultTimeStr = (row[5] || '').trim()
                  if (!queueId) continue
                  const status = mapResultStatus(resultStr)
                  if (!status) { skipped++; continue }
                  updateMap.set(queueId, { id: queueId, status, sent_at: parseResultTime(resultTimeStr) })
                  deviceRows++
                }
              }
              send({ type: 'device_done', index: i, phone: device.phone_number, name: deviceLabel, rows: deviceRows })
            } catch (err: any) {
              send({ type: 'device_error', index: i, phone: device.phone_number, name: deviceLabel, error: err?.message || '시트 읽기 실패' })
            }
          })

          await Promise.allSettled(promises)
        }

        // DB 업데이트
        const updates = [...updateMap.values()]
        send({ type: 'db_update_start', total: updates.length })

        let sentCount = 0
        let failedCount = 0

        if (updates.length > 0) {
          const sentUpdates = updates.filter(u => u.status === 'sent')
          const failedUpdates = updates.filter(u => u.status === 'failed')

          // RPC 배치 업데이트 (건별 루프 대신 SQL 함수 한 번 호출)
          const { data: rpcResult, error: rpcErr } = await supabase.rpc('batch_update_queue_results', {
            p_sent_ids: sentUpdates.map(u => u.id),
            p_sent_times: sentUpdates.map(u => u.sent_at),
            p_failed_ids: failedUpdates.map(u => u.id),
            p_failed_times: failedUpdates.map(u => u.sent_at),
          })

          if (rpcErr) throw new Error(`배치 업데이트 실패: ${rpcErr.message}`)
          if (rpcResult && rpcResult.length > 0) {
            sentCount = rpcResult[0].sent_count ?? 0
            failedCount = rpcResult[0].failed_count ?? 0
          }

          send({ type: 'db_update_done', sent: sentCount, failed: failedCount })

          // 구독 상태 업데이트
          await updateSubscriptionStatuses(updates, date)
        }

        // app_settings 업데이트
        const now = new Date().toISOString()
        await supabase.from('app_settings').upsert({ key: 'last_sheet_import_at', value: JSON.stringify(now), updated_at: now })

        send({ type: 'complete', processed: sentCount + failedCount, sent: sentCount, failed: failedCount, skipped })
      } catch (err: any) {
        send({ type: 'error', message: err.message || '결과 가져오기 중 오류가 발생했습니다' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// ─── 기존 배치 방식 (하위 호환) ──────────────────────────────

async function batchImport(date: string) {
  try {
    const { data: devices, error: devErr } = await supabase
      .from('send_devices')
      .select('id, phone_number, is_active')
      .eq('is_active', true)

    if (devErr) throw new Error(`디바이스 조회 실패: ${devErr.message}`)
    if (!devices?.length) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, skipped: 0, message: '활성 디바이스가 없습니다' })
    }

    const updateMap = new Map<string, { id: string; status: 'sent' | 'failed'; sent_at: string | null }>()
    let skipped = 0
    const sheetErrors: string[] = []

    for (const device of devices) {
      let rows: string[][]
      try {
        rows = await readSheetData(device.phone_number)
      } catch (err: any) {
        sheetErrors.push(`${device.phone_number}: ${err?.message || '시트 읽기 실패'}`)
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
        if (!status) { skipped++; continue }
        updateMap.set(queueId, { id: queueId, status, sent_at: parseResultTime(resultTimeStr) })
      }
    }

    const updates = [...updateMap.values()]
    if (!updates.length) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, skipped })
    }

    let sentCount = 0
    let failedCount = 0
    const sentUpdates = updates.filter(u => u.status === 'sent')
    const failedUpdates = updates.filter(u => u.status === 'failed')

    // RPC 배치 업데이트
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('batch_update_queue_results', {
      p_sent_ids: sentUpdates.map(u => u.id),
      p_sent_times: sentUpdates.map(u => u.sent_at),
      p_failed_ids: failedUpdates.map(u => u.id),
      p_failed_times: failedUpdates.map(u => u.sent_at),
    })
    if (rpcErr) throw new Error(`배치 업데이트 실패: ${rpcErr.message}`)
    if (rpcResult && rpcResult.length > 0) {
      sentCount = rpcResult[0].sent_count ?? 0
      failedCount = rpcResult[0].failed_count ?? 0
    }

    await updateSubscriptionStatuses(updates, date)

    const now = new Date().toISOString()
    await supabase.from('app_settings').upsert({ key: 'last_sheet_import_at', value: JSON.stringify(now), updated_at: now })

    return NextResponse.json({
      ok: true,
      processed: sentCount + failedCount,
      sent: sentCount,
      failed: failedCount,
      skipped,
      sheetErrors: sheetErrors.length > 0 ? sheetErrors : undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '결과 가져오기 중 오류가 발생했습니다' }, { status: 500 })
  }
}

// ─── 구독 상태 업데이트 (공통) ──────────────────────────────

async function updateSubscriptionStatuses(
  updates: { id: string; status: 'sent' | 'failed'; sent_at: string | null }[],
  date: string
) {
  const allUpdateIds = updates.map(u => u.id)

  const { data: updatedQueues, error: fetchErr } = await supabase
    .from('send_queues')
    .select('id, subscription_id, day_number, status, send_date')
    .in('id', allUpdateIds)

  if (fetchErr) throw new Error(`업데이트된 큐 조회 실패: ${fetchErr.message}`)

  const subDayGroups = new Map<string, { subscriptionId: string; dayNumber: number; sendDate: string }>()
  for (const q of updatedQueues || []) {
    if (!q.subscription_id || !q.day_number) continue
    const key = `${q.subscription_id}:${q.day_number}`
    if (!subDayGroups.has(key)) {
      subDayGroups.set(key, { subscriptionId: q.subscription_id, dayNumber: q.day_number, sendDate: q.send_date })
    }
  }

  if (subDayGroups.size === 0) return

  const affectedSubIds = [...new Set([...subDayGroups.values()].map(g => g.subscriptionId))]
  const { data: allSubQueues } = await supabase
    .from('send_queues')
    .select('subscription_id, day_number, send_date, status')
    .in('subscription_id', affectedSubIds)
    .eq('send_date', date)

  const fullStatusMap = new Map<string, string[]>()
  for (const q of allSubQueues || []) {
    if (!q.day_number) continue
    const key = `${q.subscription_id}:${q.day_number}`
    const arr = fullStatusMap.get(key) || []
    arr.push(q.status)
    fullStatusMap.set(key, arr)
  }

  const { data: subData } = await supabase
    .from('subscriptions')
    .select('id, last_sent_day')
    .in('id', affectedSubIds)

  const lastSentDayMap = new Map<string, number>()
  for (const s of subData || []) {
    lastSentDayMap.set(s.id, s.last_sent_day ?? 0)
  }

  const now = new Date().toISOString()
  const sortedGroups = [...subDayGroups.entries()].sort((a, b) => a[1].dayNumber - b[1].dayNumber)

  for (const [key, group] of sortedGroups) {
    const allStatuses = fullStatusMap.get(key)
    if (!allStatuses) continue
    if (allStatuses.includes('pending')) continue

    if (allStatuses.includes('failed')) {
      await supabase
        .from('subscriptions')
        .update({ failure_type: 'failed', failure_date: group.sendDate, updated_at: now })
        .eq('id', group.subscriptionId)
      continue
    }

    if (allStatuses.every(s => s === 'sent')) {
      const lastSentDay = lastSentDayMap.get(group.subscriptionId) ?? 0
      if (group.dayNumber === lastSentDay + 1) {
        await supabase
          .from('subscriptions')
          .update({ last_sent_day: group.dayNumber, failure_type: null, failure_date: null, updated_at: now })
          .eq('id', group.subscriptionId)
        lastSentDayMap.set(group.subscriptionId, group.dayNumber)
      }
    }
  }
}
