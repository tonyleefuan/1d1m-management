import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

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
    // per-device 가드가 각 PC별로 중복을 체크하므로 global 가드는 제거
    // (부분 실행 후 재시도 가능하도록)
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

    // 1) 구독 조회 (페이지네이션)
    const PAGE_SIZE = 1000
    const subs: any[] = []
    let from = 0
    while (true) {
      const { data: page, error: subErr } = await supabase
        .from('subscriptions')
        .select(`
          id, customer_id, product_id, device_id, last_sent_day, duration_days, send_priority,
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

    // 2) 메시지 벌크 프리페치 — 개별 쿼리 수천 회 → 2회로 최적화
    const fixedKeys = new Set<string>()
    const realtimeProductIds = new Set<string>()

    for (const sub of subs) {
      const product = sub.product as any
      const currentDay = (sub.last_sent_day ?? 0) + 1
      if (currentDay < 1 || currentDay > sub.duration_days) continue
      if (product?.message_type === 'realtime') {
        realtimeProductIds.add(sub.product_id)
      } else {
        fixedKeys.add(`${sub.product_id}:${currentDay}`)
      }
    }

    // fixed 메시지 한 번에 조회 (페이지네이션으로 1000행 제한 우회)
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

      // 상품 배치 × 페이지네이션으로 전체 조회
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

    // realtime 메시지 한 번에 조회
    const realtimeMsgMap = new Map<string, { content: string; image_path: string | null }>()
    if (realtimeProductIds.size > 0) {
      const { data, error } = await supabase
        .from('daily_messages')
        .select('product_id, content, image_path')
        .in('product_id', [...realtimeProductIds])
        .eq('send_date', date)
        .eq('status', 'approved')
      if (error) return NextResponse.json({ error: `실시간 메시지 조회 실패: ${error.message}` }, { status: 500 })
      data?.forEach(dm => realtimeMsgMap.set(dm.product_id, { content: dm.content, image_path: dm.image_path }))
    }

    // 3) 대기열 레코드 생성 (순수 인메모리 — DB 쿼리 없음)
    const queueRows: any[] = []
    let sortOrder = 0
    let skippedNoMsg = 0
    let skippedDayRange = 0

    for (const sub of subs) {
      const product = sub.product as any
      const customer = sub.customer as any
      const kakaoName = customer?.kakao_friend_name || '알 수 없음'
      const currentDay = (sub.last_sent_day ?? 0) + 1

      if (currentDay < 1 || currentDay > sub.duration_days) { skippedDayRange++; continue }

      let messages: { content: string; image_path: string | null; sort_order: number }[] = []

      if (product?.message_type === 'realtime') {
        const dm = realtimeMsgMap.get(sub.product_id)
        if (dm) messages = [{ content: dm.content, image_path: dm.image_path, sort_order: 1 }]
      } else {
        const key = `${sub.product_id}:${currentDay}`
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
          day_number: currentDay,
          kakao_friend_name: kakaoName,
          message_content: msg.content,
          image_path: null,
          sort_order: sortOrder,
          message_seq: `${seqNum}/${totalItems}`,
          status: 'pending',
        })
        if (msg.image_path) {
          sortOrder++
          seqNum++
          queueRows.push({
            subscription_id: sub.id,
            device_id: deviceId,
            send_date: date,
            day_number: currentDay,
            kakao_friend_name: kakaoName,
            message_content: '',
            image_path: msg.image_path,
            sort_order: sortOrder,
            message_seq: `${seqNum}/${totalItems}`,
            status: 'pending',
          })
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

    // 4) 배치 삽입 (500개씩)
    let inserted = 0
    for (let i = 0; i < queueRows.length; i += 500) {
      const batch = queueRows.slice(i, i + 500)
      const { error } = await supabase.from('send_queues').insert(batch)
      if (error) return NextResponse.json({ error: `대기열 삽입 실패: ${error.message}` }, { status: 500 })
      inserted += batch.length
    }

    return NextResponse.json({
      ok: true,
      generated: inserted,
      device_id: deviceId,
      subscriptions: subs.length,
      skippedNoMsg, skippedDayRange,
      date,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '대기열 생성 중 오류가 발생했습니다' }, { status: 500 })
  }
}
