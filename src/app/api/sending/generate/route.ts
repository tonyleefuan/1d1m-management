import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const today = new Date().toISOString().slice(0, 10)

    // 이미 오늘 대기열이 있는지 확인 + 삭제 (race condition 방지)
    const { count: existing } = await supabase
      .from('send_queues')
      .select('id', { count: 'exact', head: true })
      .eq('send_date', today)

    if (existing && existing > 0) {
      return NextResponse.json({ error: `오늘(${today}) 대기열이 이미 ${existing}건 존재합니다. 삭제 후 재생성하세요.` }, { status: 400 })
    }

    // live + PC 배정된 구독 조회
    const { data: subs, error: subErr } = await supabase
      .from('subscriptions')
      .select(`
        id, customer_id, product_id, device_id, day, duration_days, send_priority,
        customer:customers(kakao_friend_name),
        product:products(sku_code, message_type),
        order_item:order_items(order:orders(ordered_at))
      `)
      .eq('status', 'live')
      .not('device_id', 'is', null)

    if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 })
    if (!subs?.length) return NextResponse.json({ ok: true, generated: 0, message: '발송 대상이 없습니다' })

    // 정렬: send_priority ASC → ordered_at ASC
    const sorted = subs.sort((a, b) => {
      const pDiff = (a.send_priority || 3) - (b.send_priority || 3)
      if (pDiff !== 0) return pDiff
      const aDate = (a as any).order_item?.order?.ordered_at || ''
      const bDate = (b as any).order_item?.order?.ordered_at || ''
      return aDate.localeCompare(bDate)
    })

    // 메시지 캐시: product_id+day → messages (N+1 방지)
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
          .eq('send_date', today)
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

    // PC별로 그룹화
    const deviceGroups = new Map<string, typeof sorted>()
    for (const sub of sorted) {
      const group = deviceGroups.get(sub.device_id!) || []
      group.push(sub)
      deviceGroups.set(sub.device_id!, group)
    }

    // 대기열 레코드 생성
    const queueRows: any[] = []

    for (const [deviceId, deviceSubs] of deviceGroups) {
      let sortOrder = 0

      for (const sub of deviceSubs) {
        const product = sub.product as any
        const customer = sub.customer as any
        const kakaoName = customer?.kakao_friend_name || '알 수 없음'
        const currentDay = sub.day

        if (currentDay < 1 || currentDay > sub.duration_days) continue

        const messages = await getMessages(sub.product_id, product?.message_type, currentDay)
        if (!messages.length) continue

        // 총 발송 건수 계산 (텍스트 + 파일)
        const totalItems = messages.reduce((n, m) => n + 1 + (m.image_path ? 1 : 0), 0)
        let seqNum = 0

        for (const msg of messages) {
          sortOrder++
          seqNum++
          queueRows.push({
            subscription_id: sub.id,
            device_id: deviceId,
            send_date: today,
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
              send_date: today,
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
    }

    if (!queueRows.length) {
      return NextResponse.json({ ok: true, generated: 0, message: '매칭되는 메시지가 없습니다' })
    }

    // 일괄 삽입 (500개씩 배치)
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
      devices: deviceGroups.size,
      date: today,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '대기열 생성 중 오류가 발생했습니다' }, { status: 500 })
  }
}
