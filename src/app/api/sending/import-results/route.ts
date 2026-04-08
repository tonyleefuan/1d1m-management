export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'
import { readSheetData } from '@/lib/google-sheets'

export const maxDuration = 120

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
              let isFirstDataRow = true  // PC별 첫 행 플래그
              if (rows.length > 1) {
                for (let r = 1; r < rows.length; r++) {
                  const row = rows[r]
                  if (!row || row.length < 7) continue
                  const queueId = (row[6] || '').trim()
                  const resultStr = (row[4] || '').trim()
                  const resultTimeStr = (row[5] || '').trim()
                  if (!queueId) continue
                  let status = mapResultStatus(resultStr)
                  if (!status) { skipped++; continue }
                  // PC별 첫 행은 시스템 이슈로 실패해도 성공으로 처리
                  if (isFirstDataRow && status === 'failed') {
                    status = 'sent'
                  }
                  isFirstDataRow = false
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
          send({ type: 'sub_update_start' })
          await updateSubscriptionStatuses(updates, date, (msg) => send({ type: 'sub_update_progress', message: msg }))
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

      let isFirstDataRow = true
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length < 7) continue
        const queueId = (row[6] || '').trim()
        const resultStr = (row[4] || '').trim()
        const resultTimeStr = (row[5] || '').trim()
        if (!queueId) continue
        let status = mapResultStatus(resultStr)
        if (!status) { skipped++; continue }
        // PC별 첫 행은 시스템 이슈로 실패해도 성공으로 처리
        if (isFirstDataRow && status === 'failed') {
          status = 'sent'
        }
        isFirstDataRow = false
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
  _updates: { id: string; status: 'sent' | 'failed'; sent_at: string | null }[],
  date: string,
  onProgress?: (msg: string) => void,
) {
  onProgress?.('큐 상태 조회 중...')
  // 날짜 기반 단일 쿼리로 해당 날짜의 모든 큐를 가져옴
  const allQueues: any[] = []
  let offset = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('send_queues')
      .select('subscription_id, day_number, status, is_notice')
      .eq('send_date', date)
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`큐 조회 실패: ${error.message}`)
    if (!data?.length) break
    allQueues.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  onProgress?.(`${allQueues.length}건 조회 완료, 구독 상태 분석 중...`)

  // 구독+Day별 상태 그룹화
  const subDayGroups = new Map<string, { subscriptionId: string; dayNumber: number; statuses: string[] }>()
  for (const q of allQueues) {
    if (!q.subscription_id || !q.day_number || q.is_notice) continue
    const key = `${q.subscription_id}:${q.day_number}`
    if (!subDayGroups.has(key)) {
      subDayGroups.set(key, { subscriptionId: q.subscription_id, dayNumber: q.day_number, statuses: [] })
    }
    subDayGroups.get(key)!.statuses.push(q.status)
  }

  if (subDayGroups.size === 0) return

  // 영향 받는 구독의 last_sent_day 조회 (배치)
  const affectedSubIds = [...new Set([...subDayGroups.values()].map(g => g.subscriptionId))]
  const lastSentDayMap = new Map<string, number>()
  for (let i = 0; i < affectedSubIds.length; i += 500) {
    const batch = affectedSubIds.slice(i, i + 500)
    const { data } = await supabase.from('subscriptions').select('id, last_sent_day').in('id', batch)
    for (const s of data || []) {
      lastSentDayMap.set(s.id, s.last_sent_day ?? 0)
    }
  }

  // 구독 업데이트 분류
  const now = new Date().toISOString()
  const sortedGroups = [...subDayGroups.values()].sort((a, b) => a.dayNumber - b.dayNumber)

  const failureSubIds = new Set<string>()
  // 구독별 최대 연속 성공 Day만 추적 (multi-day bulk 시 하나의 UPDATE로 통합)
  const subMaxSuccessDay = new Map<string, number>()

  for (const group of sortedGroups) {
    // pending 남아있으면 성공/실패 판단 보류
    if (group.statuses.includes('pending')) continue

    if (group.statuses.includes('failed')) {
      failureSubIds.add(group.subscriptionId)
      continue
    }

    if (group.statuses.every(s => s === 'sent')) {
      const lastSentDay = lastSentDayMap.get(group.subscriptionId) ?? 0
      if (group.dayNumber === lastSentDay + 1) {
        lastSentDayMap.set(group.subscriptionId, group.dayNumber)
        subMaxSuccessDay.set(group.subscriptionId, group.dayNumber)
      }
    }
  }

  const successUpdates = [...subMaxSuccessDay.entries()].map(([id, day]) => ({ id, day }))
  // 같은 런에서 failure도 발생한 구독은 성공에서 제외
  const safeSuccessUpdates = successUpdates.filter(u => !failureSubIds.has(u.id))
  onProgress?.(`구독 반영 중... (성공 ${safeSuccessUpdates.length}건, 실패 ${failureSubIds.size}건)`)

  // 배치 업데이트: 성공 구독 — day별 그룹화 후 단일 UPDATE
  const dayGroups = new Map<number, string[]>()
  for (const u of safeSuccessUpdates) {
    const arr = dayGroups.get(u.day) || []
    arr.push(u.id)
    dayGroups.set(u.day, arr)
  }
  for (const [day, ids] of dayGroups) {
    for (let i = 0; i < ids.length; i += 500) {
      const batch = ids.slice(i, i + 500)
      await supabase.from('subscriptions')
        .update({ last_sent_day: day, updated_at: now })
        .in('id', batch)
    }
  }

  // ─── Chain advancement: 이미 sent된 다음 Day들을 연쇄 전진 ───
  if (safeSuccessUpdates.length > 0) {
    onProgress?.('연쇄 Day 전진 확인 중...')
    const chainUpdates = new Map<string, number>() // subId → final chained last_sent_day

    for (const u of safeSuccessUpdates) {
      const currentLast = u.day
      // 이 구독의 현재 last_sent_day 이후에 이미 sent인 큐가 있는지 확인
      const { data: sentQueues } = await supabase
        .from('send_queues')
        .select('day_number')
        .eq('subscription_id', u.id)
        .eq('status', 'sent')
        .eq('is_notice', false)
        .gt('day_number', currentLast)
        .order('day_number', { ascending: true })

      if (!sentQueues?.length) continue

      let chainedDay = currentLast
      for (const sq of sentQueues) {
        if (sq.day_number === chainedDay + 1) {
          chainedDay = sq.day_number
        } else {
          break // 갭 발견 — 중단
        }
      }

      if (chainedDay > currentLast) {
        chainUpdates.set(u.id, chainedDay)
      }
    }

    // 체인 전진 결과 배치 업데이트
    if (chainUpdates.size > 0) {
      onProgress?.(`연쇄 전진 ${chainUpdates.size}건 반영 중...`)
      // day별로 그룹화하여 배치 UPDATE
      const chainDayGroups = new Map<number, string[]>()
      for (const [id, day] of chainUpdates) {
        const arr = chainDayGroups.get(day) || []
        arr.push(id)
        chainDayGroups.set(day, arr)
      }
      for (const [day, ids] of chainDayGroups) {
        for (let i = 0; i < ids.length; i += 500) {
          const batch = ids.slice(i, i + 500)
          await supabase.from('subscriptions')
            .update({ last_sent_day: day, updated_at: now })
            .in('id', batch)
        }
      }
    }
  }

  // ─── 3일 연속 실패 감지 → 자동 일시정지 ───
  if (failureSubIds.size > 0) {
    onProgress?.('연속 실패 감지 중...')
    const pauseIds: string[] = []

    for (const subId of failureSubIds) {
      // 해당 구독의 최근 3개 send_date에서의 큐 상태 확인
      const { data: recentQueues } = await supabase
        .from('send_queues')
        .select('send_date, status')
        .eq('subscription_id', subId)
        .eq('is_notice', false)
        .order('send_date', { ascending: false })

      if (!recentQueues?.length) continue

      // send_date별로 그룹화
      const dateStatusMap = new Map<string, Set<string>>()
      for (const q of recentQueues) {
        if (!dateStatusMap.has(q.send_date)) {
          dateStatusMap.set(q.send_date, new Set())
        }
        dateStatusMap.get(q.send_date)!.add(q.status)
      }

      // 최근 3개 날짜 추출
      const recentDates = [...dateStatusMap.keys()].slice(0, 3)
      if (recentDates.length < 3) continue

      // 3개 날짜 모두 failed만 있는지 확인 (sent나 pending이 없어야 함)
      const allFailed = recentDates.every(d => {
        const statuses = dateStatusMap.get(d)!
        return statuses.has('failed') && !statuses.has('sent') && !statuses.has('pending')
      })

      if (allFailed) {
        pauseIds.push(subId)
      }
    }

    if (pauseIds.length > 0) {
      onProgress?.(`3일 연속 실패 ${pauseIds.length}건 자동 일시정지...`)
      for (let i = 0; i < pauseIds.length; i += 500) {
        const batch = pauseIds.slice(i, i + 500)
        await supabase.from('subscriptions')
          .update({ status: 'pause', paused_at: now, updated_at: now })
          .in('id', batch)
      }
    }
  }
}
