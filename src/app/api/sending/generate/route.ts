import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { todayKST } from '@/lib/day'

export const maxDuration = 60

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

    // ── device_id 없으면: PC 목록 반환 (프론트가 순차 호출할 목록) ──
    if (!deviceId) {
      // 이미 대기열 있는지 확인
      const { count: existing } = await supabase
        .from('send_queues')
        .select('id', { count: 'exact', head: true })
        .eq('send_date', date)

      if (existing && existing > 0) {
        return NextResponse.json({ error: `${date} 대기열이 이미 ${existing}건 존재합니다. 삭제 후 재생성하세요.` }, { status: 400 })
      }

      // 활성 디바이스 목록 반환
      const { data: devices } = await supabase
        .from('send_devices')
        .select('id, phone_number')
        .eq('is_active', true)

      return NextResponse.json({
        ok: true,
        mode: 'device_list',
        devices: devices || [],
        date,
      })
    }

    // ── device_id 있으면: 해당 PC의 대기열 생성 ──

    // 중복 방지: 해당 PC+날짜에 이미 대기열이 있으면 스킵
    const { count: deviceExisting } = await supabase
      .from('send_queues')
      .select('id', { count: 'exact', head: true })
      .eq('send_date', date)
      .eq('device_id', deviceId)

    if (deviceExisting && deviceExisting > 0) {
      return NextResponse.json({
        ok: true,
        generated: 0,
        device_id: deviceId,
        skipped: true,
        message: `이미 ${deviceExisting}건의 대기열이 존재하여 스킵합니다`,
      })
    }

    // 해당 PC의 live 구독 조회 (페이지네이션)
    const PAGE_SIZE = 1000
    const subs: any[] = []
    let from = 0
    while (true) {
      const { data: page, error: subErr } = await supabase
        .from('subscriptions')
        .select(`
          id, customer_id, product_id, device_id, day, duration_days, send_priority,
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

    if (!subs.length) return NextResponse.json({ ok: true, generated: 0, device_id: deviceId })

    // 정렬: send_priority ASC → ordered_at ASC
    subs.sort((a, b) => {
      const pDiff = (a.send_priority || 3) - (b.send_priority || 3)
      if (pDiff !== 0) return pDiff
      const aDate = (a as any).order_item?.order?.ordered_at || ''
      const bDate = (b as any).order_item?.order?.ordered_at || ''
      return aDate.localeCompare(bDate)
    })

    // 메시지 캐시
    const msgCache = new Map<string, { content: string; image_path: string | null; sort_order: number }[]>()

    async function getMessages(productId: string, messageType: string, day: number) {
      const cacheKey = `${productId}:${day}:${messageType}`
      if (msgCache.has(cacheKey)) return msgCache.get(cacheKey)!

      let messages: { content: string; image_path: string | null; sort_order: number }[] = []

      if (messageType === 'realtime') {
        const { data, error } = await supabase
          .from('daily_messages')
          .select('content, image_path')
          .eq('product_id', productId)
          .eq('send_date', date)
          .eq('status', 'approved')
          .limit(1)
        if (error) throw new Error(`실시간 메시지 조회 실패: ${error.message}`)
        if (data?.length) {
          messages = [{ content: data[0].content, image_path: data[0].image_path, sort_order: 1 }]
        }
      } else {
        const { data, error } = await supabase
          .from('messages')
          .select('content, image_path, sort_order')
          .eq('product_id', productId)
          .eq('day_number', day)
          .order('sort_order', { ascending: true })
        if (error) throw new Error(`고정 메시지 조회 실패: ${error.message}`)
        if (data?.length) messages = data
      }

      msgCache.set(cacheKey, messages)
      return messages
    }

    // 대기열 레코드 생성
    const queueRows: any[] = []
    let sortOrder = 0

    for (const sub of subs) {
      const product = sub.product as any
      const customer = sub.customer as any
      const kakaoName = customer?.kakao_friend_name || '알 수 없음'
      const currentDay = sub.day

      if (currentDay < 1 || currentDay > sub.duration_days) continue

      const messages = await getMessages(sub.product_id, product?.message_type, currentDay)
      if (!messages.length) continue

      const totalItems = messages.reduce((n: number, m: any) => n + 1 + (m.image_path ? 1 : 0), 0)
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
      return NextResponse.json({ ok: true, generated: 0, device_id: deviceId })
    }

    // 500개씩 배치 삽입
    let inserted = 0
    for (let i = 0; i < queueRows.length; i += 500) {
      const batch = queueRows.slice(i, i + 500)
      const { error } = await supabase.from('send_queues').insert(batch)
      if (error) return NextResponse.json({ error: `대기열 생성 실패: ${error.message}` }, { status: 500 })
      inserted += batch.length
    }

    return NextResponse.json({
      ok: true,
      generated: inserted,
      device_id: deviceId,
      subscriptions: subs.length,
      date,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '대기열 생성 중 오류가 발생했습니다' }, { status: 500 })
  }
}
