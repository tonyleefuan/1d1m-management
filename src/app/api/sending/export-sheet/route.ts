export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'
import { ensureSheetTab, writeSheetData, appendSheetData } from '@/lib/google-sheets'

export const maxDuration = 120

// 날짜를 YYMMDD 형식으로 변환
function toYYMMDD(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${y.slice(2)}${m}${d}`
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const date = body.date || todayKST()
    const force = body.force === true
    const queueIds: string[] | null = body.queue_ids || null // 선택 내보내기용
    const deviceIdFilter: string | null = body.device_id || null // PC 단위 분할 호출용 (queue_ids와 상호 배타 — 현재 클라이언트는 둘 중 하나만 전달)

    // --- 이전 미수집 결과 자동 import ---
    // device_id 단위 호출(PC 분할)에서는 auto-import/시트 초기화를 건너뜀
    // (시트 초기화는 사용자가 별도 버튼으로 먼저 실행)
    const skipPrepare = !!deviceIdFilter

    const { count: pendingPrevCount } = skipPrepare
      ? { count: 0 }
      : await supabase
          .from('send_queues')
          .select('id', { count: 'exact', head: true })
          .lt('send_date', date)
          .eq('status', 'pending')

    let autoImported = false
    if (!skipPrepare && pendingPrevCount && pendingPrevCount > 0) {
      const { readSheetData: readSheet } = await import('@/lib/google-sheets')
      const { data: prevDevices } = await supabase
        .from('send_devices').select('phone_number').eq('is_active', true)

      for (const dev of prevDevices || []) {
        let rows: string[][]
        try { rows = await readSheet(dev.phone_number) } catch { continue }
        if (rows.length <= 1) continue

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row || row.length < 7) continue
          const queueId = (row[6] || '').trim()
          const resultStr = (row[4] || '').trim()
          const resultTimeStr = (row[5] || '').trim()
          if (!queueId || !resultStr) continue

          const status = resultStr === '성공' ? 'sent' : resultStr === '실패' ? 'failed' : null
          if (!status) continue

          const match = resultTimeStr.match(/^(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/)
          const sentAt = match ? `20${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00` : null

          await supabase
            .from('send_queues')
            .update({ status, sent_at: sentAt, ...(status === 'failed' ? { error_message: '수동 발송 실패' } : {}) })
            .eq('id', queueId)
            .eq('status', 'pending')
        }
      }
      autoImported = true

      // --- auto-import 후 last_sent_day 갱신 ---
      // 이전 날짜의 pending → sent/failed 전환 후, 모든 큐가 'sent'인 Day에 대해 last_sent_day 전진
      const { data: prevQueues } = await supabase
        .from('send_queues')
        .select('subscription_id, day_number, status, is_notice')
        .lt('send_date', date)
        .not('subscription_id', 'is', null)

      if (prevQueues && prevQueues.length > 0) {
        // 구독+Day별 상태 그룹화
        const subDayGroups = new Map<string, { dayNumber: number; statuses: string[] }>()
        for (const q of prevQueues) {
          if (!q.subscription_id || !q.day_number || q.is_notice) continue
          const key = `${q.subscription_id}:${q.day_number}`
          if (!subDayGroups.has(key)) {
            subDayGroups.set(key, { dayNumber: q.day_number, statuses: [] })
          }
          subDayGroups.get(key)!.statuses.push(q.status)
        }

        // 영향받는 구독 ID 수집
        const affectedSubIds = [...new Set(prevQueues.filter(q => q.subscription_id).map(q => q.subscription_id!))]
        const lastSentDayMap = new Map<string, number>()
        for (let i = 0; i < affectedSubIds.length; i += 500) {
          const batch = affectedSubIds.slice(i, i + 500)
          const { data: subs } = await supabase.from('subscriptions').select('id, last_sent_day').in('id', batch)
          for (const s of subs || []) {
            lastSentDayMap.set(s.id, s.last_sent_day ?? 0)
          }
        }

        // Day 순서대로 정렬하여 연속 성공 Day 찾기
        const sortedEntries = [...subDayGroups.entries()].sort((a, b) => a[1].dayNumber - b[1].dayNumber)
        const subMaxSuccessDay = new Map<string, number>()

        for (const [key, group] of sortedEntries) {
          const subscriptionId = key.split(':')[0]
          // pending이 남아있으면 보류
          if (group.statuses.includes('pending')) continue
          if (group.statuses.every(s => s === 'sent')) {
            const lastSentDay = lastSentDayMap.get(subscriptionId) ?? 0
            if (group.dayNumber === lastSentDay + 1) {
              lastSentDayMap.set(subscriptionId, group.dayNumber)
              subMaxSuccessDay.set(subscriptionId, group.dayNumber)
            }
          }
        }

        // 배치 업데이트
        const now = new Date().toISOString()
        const dayUpdateGroups = new Map<number, string[]>()
        for (const [subId, day] of subMaxSuccessDay) {
          const arr = dayUpdateGroups.get(day) || []
          arr.push(subId)
          dayUpdateGroups.set(day, arr)
        }
        for (const [day, ids] of dayUpdateGroups) {
          for (let i = 0; i < ids.length; i += 500) {
            const batch = ids.slice(i, i + 500)
            await supabase.from('subscriptions')
              .update({ last_sent_day: day, updated_at: now })
              .in('id', batch)
          }
        }
      }
    }

    // --- 이어 붙이기 vs 초기화 판단 ---
    const { data: lastExportSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'last_sheet_export_date')
      .single()

    const lastExportDate = lastExportSetting
      ? (typeof lastExportSetting.value === 'string'
          ? lastExportSetting.value.replace(/^"|"$/g, '')
          : String(lastExportSetting.value))
      : null

    // #14: 선택 내보내기(queueIds) 또는 PC 단위 분할(device_id)은 항상 이어 붙이기
    //      force 전체 재내보내기 = 초기화
    const isAppend = !!queueIds || !!deviceIdFilter || (lastExportDate === date && !force)

    // --- 발송 설정 조회 ---
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

    const startTime = String(settings.send_start_time)
    const msgDelay = Number(settings.send_message_delay) || 3
    const fileDelay = Number(settings.send_file_delay) || 6
    const [startH, startM] = startTime.split(':').map(Number)
    const baseSeconds = startH * 3600 + startM * 60

    // --- 대기열 조회 (페이지네이션으로 전체 fetch) ---
    const PAGE_SIZE = 5000
    const queueData: any[] = []
    let from = 0

    while (true) {
      let query = supabase
        .from('send_queues')
        .select('*')
        .eq('send_date', date)
        .order('device_id')
        .order('sort_order', { ascending: true })
        .range(from, from + PAGE_SIZE - 1)

      if (queueIds && queueIds.length > 0) {
        query = query.in('id', queueIds)
      } else {
        query = query.eq('status', 'pending')
      }

      if (deviceIdFilter) {
        query = query.eq('device_id', deviceIdFilter)
      }

      const { data: page, error: queueErr } = await query
      if (queueErr) throw new Error(`대기열 조회 실패: ${queueErr.message}`)
      if (!page?.length) break

      queueData.push(...page)
      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    if (!queueData.length) {
      return NextResponse.json({ ok: true, devices: 0, total: 0, date, message: '내보낼 대기열이 없습니다' })
    }

    // --- 활성 디바이스 조회 ---
    const { data: devices, error: devErr } = await supabase
      .from('send_devices')
      .select('id, phone_number, is_active')
      .eq('is_active', true)

    if (devErr) throw new Error(`디바이스 조회 실패: ${devErr.message}`)

    const deviceMap = new Map<string, string>()
    devices?.forEach(d => deviceMap.set(d.id, d.phone_number))

    // --- PC별 그룹화 ---
    const deviceGroups = new Map<string, typeof queueData>()
    for (const item of queueData) {
      if (!deviceMap.has(item.device_id)) continue
      const group = deviceGroups.get(item.device_id) || []
      group.push(item)
      deviceGroups.set(item.device_id, group)
    }

    // --- SSE 스트리밍으로 PC별 진행상황 전송 ---
    const datePrefix = toYYMMDD(date)
    const HEADER = ['이름/채팅방명', '텍스트', '파일', '예약시간', '처리결과', '처리일시', 'queue_id']
    const totalDevices = deviceGroups.size

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          let totalWritten = 0
          let devicesWritten = 0

          // 새 날짜 또는 force 전체 재내보내기 시 모든 PC 시트 초기화
          if (!isAppend) {
            send({ type: 'clearing', message: '시트 초기화 중...' })
            for (const [, phoneNumber] of deviceMap) {
              try {
                await ensureSheetTab(phoneNumber)
                await writeSheetData(phoneNumber, [HEADER])
              } catch { /* 탭 없으면 무시 */ }
            }
          }

          send({ type: 'start', totalDevices, totalItems: queueData.length })

          for (const [deviceId, items] of deviceGroups) {
            const phoneNumber = deviceMap.get(deviceId)
            if (!phoneNumber) continue

            send({ type: 'device_start', device: phoneNumber, deviceIndex: devicesWritten + 1, totalDevices, items: items.length })

            await ensureSheetTab(phoneNumber)

            const dataRows: string[][] = []
            let cumulativeSeconds = 0

            for (const item of items) {
              const isImage = !!item.image_path && !item.message_content
              const delay = isImage ? fileDelay : msgDelay
              // #15: 누적 방식 — 텍스트/이미지 혼합 시에도 정확한 시간
              const estimatedSeconds = baseSeconds + cumulativeSeconds
              const h = Math.floor(estimatedSeconds / 3600) % 24
              const m = Math.floor((estimatedSeconds % 3600) / 60)
              const estimatedTime = `${datePrefix} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

              dataRows.push([
                item.kakao_friend_name || '',
                isImage ? '' : (item.message_content || ''),
                isImage ? (item.image_path || '') : '',
                estimatedTime,
                '', // 처리결과
                '', // 처리일시
                item.id, // queue_id
              ])

              cumulativeSeconds += delay
            }

            // 초기화 단계에서 이미 헤더를 넣었으므로 항상 append
            await appendSheetData(phoneNumber, dataRows)

            totalWritten += items.length
            devicesWritten++

            send({ type: 'device_done', device: phoneNumber, deviceIndex: devicesWritten, totalDevices, itemsWritten: items.length, totalWritten })
          }

          // --- app_settings 업데이트 ---
          const now = new Date().toISOString()
          await supabase.from('app_settings').upsert({
            key: 'last_sheet_export_at',
            value: JSON.stringify(now),
            updated_at: now,
          })
          await supabase.from('app_settings').upsert({
            key: 'last_sheet_export_date',
            value: JSON.stringify(date),
            updated_at: now,
          })

          send({ type: 'complete', ok: true, devices: devicesWritten, total: totalWritten, date, autoImported, appended: !!isAppend })
        } catch (err: any) {
          console.error('[export-sheet] Error:', err.message, err.stack)
          send({ type: 'error', error: err.message || '시트 내보내기 중 오류가 발생했습니다' })
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
  } catch (err: any) {
    console.error('[export-sheet] Error:', err.message, err.stack)
    return NextResponse.json({ error: err.message || '시트 내보내기 중 오류가 발생했습니다' }, { status: 500 })
  }
}
