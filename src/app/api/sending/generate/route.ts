import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST, computeSubscription } from '@/lib/day'

export const maxDuration = 300

/**
 * POST /api/sending/generate
 *
 * body.device_id가 있으면 해당 PC만 생성 (프론트에서 순차 호출)
 * body.device_id가 없으면 PC 목록만 반환 (프론트가 순차 호출할 목록)
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const date = body.date || todayKST()
    const deviceId = body.device_id || null

    // ── device_id 없으면: PC 목록 반환 ──
    if (!deviceId) {
      const { data: devices } = await supabase
        .from('send_devices')
        .select('id, phone_number')
        .eq('is_active', true)

      return NextResponse.json({ ok: true, mode: 'device_list', devices: devices || [], date })
    }

    // ── device_id 있으면: 해당 PC의 대기열 생성 ──

    // 중복 방지
    const { count: deviceExisting } = await supabase
      .from('send_queues')
      .select('id', { count: 'exact', head: true })
      .eq('send_date', date)
      .eq('device_id', deviceId)

    if (deviceExisting && deviceExisting > 0) {
      return NextResponse.json({
        ok: true, generated: 0, device_id: deviceId, skipped: true,
        message: `이미 ${deviceExisting}건의 대기열이 존재하여 스킵합니다`,
      })
    }

    // 1) 구독 조회 (페이지네이션) — computeSubscription에 필요한 필드 포함
    const PAGE_SIZE = 1000
    const subs: any[] = []
    let from = 0
    while (true) {
      const { data: page, error: subErr } = await supabase
        .from('subscriptions')
        .select(`
          id, customer_id, product_id, device_id,
          start_date, duration_days, last_sent_day, paused_days, paused_at,
          is_cancelled, failure_type, recovery_mode, send_priority,
          customer:customers(kakao_friend_name),
          product:products(sku_code, message_type),
          order_item:order_items(order:orders(ordered_at))
        `)
        .eq('status', 'live')
        .eq('device_id', deviceId)
        .range(from, from + PAGE_SIZE - 1)

      if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })
      if (!page?.length) break
      subs.push(...page)
      if (page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    if (!subs.length) return NextResponse.json({ ok: true, generated: 0, device_id: deviceId, reason: 'no_live_subscriptions' })

    // 정렬: send_priority ASC → ordered_at ASC
    subs.sort((a, b) => {
      const pDiff = (a.send_priority || 3) - (b.send_priority || 3)
      if (pDiff !== 0) return pDiff
      const aDate = (a as any).order_item?.order?.ordered_at || ''
      const bDate = (b as any).order_item?.order?.ordered_at || ''
      return aDate.localeCompare(bDate)
    })

    // 2) 구독 필터링 + pending_days 계산 (queue-generator.ts와 동일 패턴)
    const activeSubs: (typeof subs[0] & { daysToSend: number[]; currentDay: number })[] = []

    for (const sub of subs) {
      const computed = computeSubscription({
        start_date: sub.start_date,
        duration_days: sub.duration_days,
        last_sent_day: sub.last_sent_day ?? 0,
        paused_days: sub.paused_days ?? 0,
        paused_at: sub.paused_at,
        is_cancelled: sub.is_cancelled ?? false,
      }, date)

      if (computed.computed_status !== 'active') continue
      if (computed.pending_days.length === 0) continue
      // 4일 이상 밀린 건 recovery_mode 없으면 스킵 (관리자 확인 필요)
      if (sub.recovery_mode === null && computed.pending_days.length >= 4) continue

      let daysToSend: number[]
      if (sub.recovery_mode === 'bulk') {
        daysToSend = computed.pending_days
      } else if (sub.recovery_mode === 'sequential') {
        daysToSend = [(sub.last_sent_day ?? 0) + 1]
      } else {
        // 기본: 최대 3일치 (실패 재발송 포함)
        daysToSend = computed.pending_days.slice(0, 3)
      }

      activeSubs.push({ ...sub, daysToSend, currentDay: computed.current_day })
    }

    // 3) 메시지 벌크 프리페치
    const fixedKeys = new Set<string>()
    // realtime: product_id별 필요한 날짜 수집 (밀린 Day → 해당 날짜의 콘텐츠)
    const realtimeDateKeys = new Set<string>() // "product_id:YYYY-MM-DD"

    for (const sub of activeSubs) {
      const product = sub.product as any
      for (const day of sub.daysToSend) {
        if (day < 1 || day > sub.duration_days) continue
        if (product?.message_type === 'realtime') {
          // Day → 실제 날짜 역산: today - (currentDay - day)
          const daysAgo = sub.currentDay - day
          const d = new Date(date) // UTC midnight 기준으로 날짜 연산
          d.setUTCDate(d.getUTCDate() - daysAgo)
          const sendDateForDay = d.toISOString().slice(0, 10)
          realtimeDateKeys.add(`${sub.product_id}:${sendDateForDay}`)
        } else {
          fixedKeys.add(`${sub.product_id}:${day}`)
        }
      }
    }

    // fixed 메시지 조회
    const fixedMsgMap = new Map<string, { content: string; image_path: string | null; sort_order: number }[]>()
    if (fixedKeys.size > 0) {
      const productDayPairs = [...fixedKeys].map(k => {
        const [pid, day] = k.split(':')
        return { pid, day: Number(day) }
      })
      const uniqueProductIds = [...new Set(productDayPairs.map(p => p.pid))]
      const allDays = productDayPairs.map(p => p.day)
      const minDay = Math.min(...allDays)
      const maxDay = Math.max(...allDays)

      // IN(day_number, ...) 대신 range 쿼리로 최적화 (수천 개 IN 값 → 범위 2개)
      for (let i = 0; i < uniqueProductIds.length; i += 20) {
        const pidBatch = uniqueProductIds.slice(i, i + 20)
        let offset = 0
        const BATCH_SIZE = 1000
        while (true) {
          const { data, error } = await supabase
            .from('messages')
            .select('product_id, day_number, content, image_path, sort_order')
            .in('product_id', pidBatch)
            .gte('day_number', minDay)
            .lte('day_number', maxDay)
            .order('sort_order', { ascending: true })
            .range(offset, offset + BATCH_SIZE - 1)
          if (error) return NextResponse.json({ error: `고정 메시지 조회 실패: ${error.message}` }, { status: 500 })
          if (!data?.length) break
          for (const msg of data) {
            const key = `${msg.product_id}:${msg.day_number}`
            // fixedKeys에 있는 조합만 저장 (range 쿼리로 여분 조회된 것 필터링)
            if (!fixedKeys.has(key)) continue
            if (!fixedMsgMap.has(key)) fixedMsgMap.set(key, [])
            fixedMsgMap.get(key)!.push({ content: msg.content, image_path: msg.image_path, sort_order: msg.sort_order })
          }
          if (data.length < BATCH_SIZE) break
          offset += BATCH_SIZE
        }
      }
    }

    // realtime 메시지 조회 — 밀린 Day의 해당 날짜 콘텐츠도 함께 조회
    const realtimeMsgMap = new Map<string, { content: string; image_path: string | null }>() // key: "product_id:date"
    if (realtimeDateKeys.size > 0) {
      const pairs = [...realtimeDateKeys].map(k => { const [pid, d] = k.split(':'); return { pid, date: d } })
      const uniquePids = [...new Set(pairs.map(p => p.pid))]
      const uniqueDates = [...new Set(pairs.map(p => p.date))]
      const { data, error } = await supabase
        .from('daily_messages')
        .select('product_id, send_date, content, image_path')
        .in('product_id', uniquePids)
        .in('send_date', uniqueDates)
        .eq('status', 'approved')
      if (error) return NextResponse.json({ error: `실시간 메시지 조회 실패: ${error.message}` }, { status: 500 })
      data?.forEach(dm => realtimeMsgMap.set(`${dm.product_id}:${dm.send_date}`, { content: dm.content, image_path: dm.image_path }))
    }

    // 4) 실패 재발송 알림 템플릿 프리페치
    let retryNotice: { content: string; image_path: string | null } | null = null
    const hasFailedSubs = activeSubs.some(s => s.failure_type === 'failed')
    if (hasFailedSubs) {
      const { data: noticeData } = await supabase
        .from('notice_templates')
        .select('content, image_path')
        .eq('notice_type', 'failure_retry_next')
        .is('product_id', null)
        .limit(1)
        .maybeSingle()
      if (noticeData) {
        retryNotice = { content: noticeData.content, image_path: noticeData.image_path || null }
      }
    }

    // start/end 알림 템플릿 프리페치
    const noticeCache = new Map<string, { content: string; image_path: string | null } | null>()
    async function getNotice(type: string): Promise<{ content: string; image_path: string | null } | null> {
      if (noticeCache.has(type)) return noticeCache.get(type)!
      const { data } = await supabase
        .from('notice_templates')
        .select('content, image_path')
        .eq('notice_type', type)
        .is('product_id', null)
        .limit(1)
        .maybeSingle()
      const result = data ? { content: data.content, image_path: data.image_path || null } : null
      noticeCache.set(type, result)
      return result
    }

    // 5) 대기열 레코드 생성
    const queueRows: any[] = []
    let sortOrder = 0
    let skippedNoMsg = 0
    let skippedDayRange = 0
    const failedSubIds: string[] = []
    // 알림 중복 방지: 같은 카톡이름에 대해 한 번만 발송
    const retryNotifiedNames = new Set<string>()

    for (const sub of activeSubs) {
      const product = sub.product as any
      const customer = sub.customer as any
      const kakaoName = customer?.kakao_friend_name || '알 수 없음'
      const isFailureRetry = sub.failure_type === 'failed'
      if (isFailureRetry) failedSubIds.push(sub.id)
      // 밀린 Day가 있으면 (pending_days > 1 = 어제 미발송) 알림 대상
      const hasMissedDays = sub.daysToSend.some((d: number) => d < sub.currentDay)

      let retryNoticePushed = false
      for (const dayNum of sub.daysToSend) {
        if (dayNum < 1 || dayNum > sub.duration_days) { skippedDayRange++; continue }

        // 미발송 알림 (카톡이름당 한 번만, 첫 유효 Day 앞에)
        if (hasMissedDays && !retryNoticePushed && retryNotice && !retryNotifiedNames.has(kakaoName)) {
          retryNoticePushed = true
          retryNotifiedNames.add(kakaoName)
          sortOrder++
          queueRows.push({
            subscription_id: sub.id,
            device_id: deviceId,
            send_date: date,
            day_number: dayNum,
            kakao_friend_name: kakaoName,
            message_content: retryNotice.content || '',
            image_path: retryNotice.image_path,
            sort_order: sortOrder,
            message_seq: null,
            status: 'pending',
            is_notice: true,
          })
        }

        // 시작 알림 (Day 1 앞)
        if (dayNum === 1) {
          const startNotice = await getNotice('start')
          if (startNotice) {
            sortOrder++
            queueRows.push({
              subscription_id: sub.id,
              device_id: deviceId,
              send_date: date,
              day_number: 0,
              kakao_friend_name: kakaoName,
              message_content: startNotice.content || '',
              image_path: startNotice.image_path,
              sort_order: sortOrder,
              message_seq: null,
              status: 'pending',
              is_notice: true,
            })
          }
        }

        let messages: { content: string; image_path: string | null; sort_order: number }[] = []

        if (product?.message_type === 'realtime') {
          // 밀린 Day의 실제 날짜 계산하여 해당 날짜 콘텐츠 조회
          const daysAgo = sub.currentDay - dayNum
          const d = new Date(date)
          d.setUTCDate(d.getUTCDate() - daysAgo)
          const sendDateForDay = d.toISOString().slice(0, 10)
          const dm = realtimeMsgMap.get(`${sub.product_id}:${sendDateForDay}`)
          if (dm) messages = [{ content: dm.content, image_path: dm.image_path, sort_order: 1 }]
        } else {
          const key = `${sub.product_id}:${dayNum}`
          messages = fixedMsgMap.get(key) || []
        }

        if (!messages.length) { skippedNoMsg++; continue }

        const totalItems = messages.reduce((n: number, m) => n + 1 + (m.image_path ? 1 : 0), 0)
        let seqNum = 0

        for (const msg of messages) {
          sortOrder++
          seqNum++
          queueRows.push({
            subscription_id: sub.id,
            device_id: deviceId,
            send_date: date,
            day_number: dayNum,
            kakao_friend_name: kakaoName,
            message_content: msg.content || '',
            image_path: null,
            sort_order: sortOrder,
            message_seq: `${seqNum}/${totalItems}`,
            status: 'pending',
            is_notice: false,
          })
          if (msg.image_path) {
            sortOrder++
            seqNum++
            queueRows.push({
              subscription_id: sub.id,
              device_id: deviceId,
              send_date: date,
              day_number: dayNum,
              kakao_friend_name: kakaoName,
              message_content: '',
              image_path: msg.image_path,
              sort_order: sortOrder,
              message_seq: `${seqNum}/${totalItems}`,
              status: 'pending',
              is_notice: false,
            })
          }
        }

        // 종료 알림 (마지막 Day 뒤)
        if (dayNum === sub.duration_days) {
          const endNotice = await getNotice('end')
          if (endNotice) {
            sortOrder++
            queueRows.push({
              subscription_id: sub.id,
              device_id: deviceId,
              send_date: date,
              day_number: sub.duration_days + 1,
              kakao_friend_name: kakaoName,
              message_content: endNotice.content || '',
              image_path: endNotice.image_path,
              sort_order: sortOrder,
              message_seq: null,
              status: 'pending',
              is_notice: true,
            })
          }
        }
      }
    }

    if (!queueRows.length) {
      return NextResponse.json({
        ok: true, generated: 0, device_id: deviceId,
        reason: 'all_skipped',
        subscriptions: subs.length, skippedNoMsg, skippedDayRange,
      })
    }

    // 6) 배치 삽입 (500개씩)
    let inserted = 0
    for (let i = 0; i < queueRows.length; i += 500) {
      const batch = queueRows.slice(i, i + 500)
      const { error } = await supabase.from('send_queues').insert(batch)
      if (error) {
        console.error(`[generate] batch ${i} insert error:`, error.message)
        return NextResponse.json({ error: `대기열 삽입 실패: ${error.message}` }, { status: 500 })
      }
      inserted += batch.length
    }

    // 7) 실패 구독 failure flags 클리어 (500개씩)
    for (let i = 0; i < failedSubIds.length; i += 500) {
      const batch = failedSubIds.slice(i, i + 500)
      await supabase.from('subscriptions').update({
        failure_type: null,
        failure_date: null,
        updated_at: new Date().toISOString(),
      }).in('id', batch)
    }

    return NextResponse.json({
      ok: true,
      generated: inserted,
      device_id: deviceId,
      subscriptions: activeSubs.length,
      skippedNoMsg, skippedDayRange,
      failureRetried: failedSubIds.length,
      date,
    })
  } catch (err: any) {
    console.error('[generate] error:', err.message)
    return NextResponse.json({ error: err.message || '대기열 생성 중 오류가 발생했습니다' }, { status: 500 })
  }
}
