export const dynamic = 'force-dynamic'
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

    // 날짜+디바이스 중복 방지
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

    // 0) 대기열 생성 전 pending→live 전환 (cron에만 의존하지 않도록)
    const now = new Date().toISOString()
    const { data: activated } = await supabase
      .from('subscriptions')
      .update({ status: 'live', updated_at: now })
      .eq('status', 'pending')
      .eq('device_id', deviceId)
      .lte('start_date', todayKST()) // body.date가 미래여도 오늘 기준으로만 활성화
      .select('id, last_sent_day')
    if (activated?.length) {
      const needInit = activated.filter(s => s.last_sent_day == null).map(s => s.id)
      if (needInit.length > 0) {
        await supabase.from('subscriptions')
          .update({ last_sent_day: 0 })
          .in('id', needInit)
      }
    }

    // 1) 구독 조회 (페이지네이션)
    const PAGE_SIZE = 1000
    const subs: any[] = []
    let from = 0
    while (true) {
      const { data: page, error: subErr } = await supabase
        .from('subscriptions')
        .select(`
          id, customer_id, product_id, device_id, status,
          start_date, duration_days, last_sent_day, paused_days, paused_at,
          is_cancelled, send_priority,
          customer:customers(kakao_friend_name),
          product:products(sku_code, message_type),
          order_item:order_items(order:orders(ordered_at))
        `)
        .eq('status', 'live')
        .eq('device_id', deviceId)
        .order('id', { ascending: true })
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

    // 1.5) 기존 큐 조회 — subscription_id + day_number 중복 방지용
    const subIds = subs.map(s => s.id)
    const existingQueueKeys = new Set<string>()
    for (let i = 0; i < subIds.length; i += 500) {
      const batch = subIds.slice(i, i + 500)
      const { data: existing } = await supabase
        .from('send_queues')
        .select('subscription_id, day_number, status')
        .in('subscription_id', batch)
        .in('status', ['pending', 'sent'])
        .eq('is_notice', false)
      existing?.forEach(q => existingQueueKeys.add(`${q.subscription_id}:${q.day_number}`))
    }

    // 1.6) 실패 큐가 있는 구독 조회 — 신규 vs 실패 구분용
    const failedSubIds = new Set<string>()
    for (let i = 0; i < subIds.length; i += 500) {
      const batch = subIds.slice(i, i + 500)
      const { data: failedQueues } = await supabase
        .from('send_queues')
        .select('subscription_id')
        .in('subscription_id', batch)
        .eq('status', 'failed')
        .eq('is_notice', false)
      failedQueues?.forEach(q => failedSubIds.add(q.subscription_id))
    }

    // 2) 구독 필터링 + pending_days 계산
    const activeSubs: (typeof subs[0] & { daysToSend: number[]; currentDay: number })[] = []

    for (const sub of subs) {
      const computed = computeSubscription({
        start_date: sub.start_date,
        duration_days: sub.duration_days,
        last_sent_day: sub.last_sent_day ?? 0,
        paused_days: sub.paused_days ?? 0,
        paused_at: sub.paused_at,
        status: sub.status ?? 'live',
      }, date)

      if (computed.computed_status !== 'active') continue
      if (computed.pending_days.length === 0) continue

      // 이미 큐가 있는 Day를 먼저 제거 (중복 제거 → 일수 제한 순서)
      // 반대로 하면: import-results 지연 시 이미 보낸 Day만 선택되어 스킵되는 버그 발생
      const availableDays = computed.pending_days.filter(d => !existingQueueKeys.has(`${sub.id}:${d}`))
      if (availableDays.length === 0) continue

      // 신규 vs 실패 구분: failed 큐 있으면 최대 3일치, 없으면 1일만
      // realtime은 항상 오늘 콘텐츠 1건만 (밀려도 같은 콘텐츠이므로 중복 발송 방지)
      const isRealtime = (sub.product as any)?.message_type === 'realtime'
      let daysToSend: number[]
      if (isRealtime) {
        daysToSend = [availableDays[0]]
      } else if (failedSubIds.has(sub.id)) {
        daysToSend = availableDays.slice(0, 3)
      } else {
        daysToSend = [availableDays[0]]
      }

      activeSubs.push({ ...sub, daysToSend, currentDay: computed.current_day })
    }

    // 3) 메시지 벌크 프리페치

    const fixedKeys = new Set<string>()
    // realtime: 밀렸든 안 밀렸든 항상 오늘(date) 날짜 콘텐츠 사용
    const realtimeDateKeys = new Set<string>() // "product_id:YYYY-MM-DD"

    for (const sub of activeSubs) {
      const product = sub.product as any
      for (const day of sub.daysToSend) {
        if (day < 1 || day > sub.duration_days) continue
        if (product?.message_type === 'realtime') {
          realtimeDateKeys.add(`${sub.product_id}:${date}`)
        } else {
          fixedKeys.add(`${sub.product_id}:${day}`)
        }
      }
    }

    // fixed 메시지 조회 — product_id+day_number 단위로 개별 조회 (cross-product 오염 방지)
    const fixedMsgMap = new Map<string, { content: string; image_path: string | null; sort_order: number }[]>()
    if (fixedKeys.size > 0) {
      // 상품별로 day 목록을 그룹화
      const daysByProduct = new Map<string, number[]>()
      for (const key of fixedKeys) {
        const [pid, day] = key.split(':')
        const days = daysByProduct.get(pid) || []
        days.push(Number(day))
        daysByProduct.set(pid, days)
      }

      for (const [pid, days] of daysByProduct) {
        const { data, error } = await supabase
          .from('messages')
          .select('product_id, day_number, content, image_path, sort_order')
          .eq('product_id', pid)
          .in('day_number', days)
          .order('day_number', { ascending: true })
          .order('sort_order', { ascending: true })
        if (error) return NextResponse.json({ error: `고정 메시지 조회 실패: ${error.message}` }, { status: 500 })
        for (const msg of data || []) {
          const key = `${msg.product_id}:${msg.day_number}`
          if (!fixedMsgMap.has(key)) fixedMsgMap.set(key, [])
          fixedMsgMap.get(key)!.push({ content: msg.content, image_path: msg.image_path, sort_order: msg.sort_order })
        }
      }
    }

    // realtime 메시지 조회
    const realtimeMsgMap = new Map<string, { content: string; image_path: string | null }>()
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

    // 4) start/end 알림 템플릿 프리페치
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

    for (const sub of activeSubs) {
      const product = sub.product as any
      const customer = sub.customer as any
      const kakaoName = customer?.kakao_friend_name || '알 수 없음'

      for (const dayNum of sub.daysToSend) {
        if (dayNum < 1 || dayNum > sub.duration_days) { skippedDayRange++; continue }

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
          const dm = realtimeMsgMap.get(`${sub.product_id}:${date}`)
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

    // 6) 배치 삽입 (500개씩) — 중복 방어는 코드 레벨(existingQueueKeys + deviceExisting 체크)
    let inserted = 0
    for (let i = 0; i < queueRows.length; i += 500) {
      const batch = queueRows.slice(i, i + 500)
      const { error } = await supabase.from('send_queues').insert(batch)
      if (error) {
        console.error(`[generate] batch ${i} insert error:`, error.message)
        // 부분 삽입된 것 정리
        if (inserted > 0) {
          const { error: rollbackErr } = await supabase.from('send_queues').delete()
            .eq('send_date', date).eq('device_id', deviceId)
          if (rollbackErr) console.error(`[generate] 롤백 실패:`, rollbackErr.message)
        }
        return NextResponse.json({ error: `대기열 삽입 실패: ${error.message}` }, { status: 500 })
      }
      inserted += batch.length
    }

    return NextResponse.json({
      ok: true,
      generated: inserted,
      device_id: deviceId,
      subscriptions: activeSubs.length,
      skippedNoMsg, skippedDayRange,
      date,
    })
  } catch (err: any) {
    console.error('[generate] error:', err.message)
    return NextResponse.json({ error: err.message || '대기열 생성 중 오류가 발생했습니다' }, { status: 500 })
  }
}
