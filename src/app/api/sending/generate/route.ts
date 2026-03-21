import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().slice(0, 10)

  // 이미 오늘 대기열이 있는지 확인
  const { count: existing } = await supabase
    .from('send_queues')
    .select('id', { count: 'exact', head: true })
    .eq('send_date', today)

  if (existing && existing > 0) {
    return NextResponse.json({ error: `오늘(${today}) 대기열이 이미 ${existing}건 존재합니다. 삭제 후 재생성하세요.` }, { status: 400 })
  }

  // live + PC 배정된 구독 조회 (우선순위 → 주문일 순)
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

  // PC별로 그룹화
  const deviceGroups = new Map<string, typeof sorted>()
  for (const sub of sorted) {
    const group = deviceGroups.get(sub.device_id!) || []
    group.push(sub)
    deviceGroups.set(sub.device_id!, group)
  }

  // 각 구독의 Day 메시지 조회 + 대기열 레코드 생성
  const queueRows: any[] = []

  for (const [deviceId, deviceSubs] of deviceGroups) {
    let sortOrder = 0

    for (const sub of deviceSubs) {
      const product = sub.product as any
      const customer = sub.customer as any
      const kakaoName = customer?.kakao_friend_name || '알 수 없음'
      const currentDay = sub.day

      if (currentDay < 1 || currentDay > sub.duration_days) continue

      // 메시지 조회: 고정 메시지는 day_number 기준, 실시간은 오늘 날짜 기준
      let messages: { content: string; image_path: string | null; sort_order: number }[] = []

      if (product?.message_type === 'realtime') {
        const { data: dm } = await supabase
          .from('daily_messages')
          .select('content, image_path')
          .eq('product_id', sub.product_id)
          .eq('send_date', today)
          .limit(1)
        if (dm?.length) {
          messages = [{ content: dm[0].content, image_path: dm[0].image_path, sort_order: 1 }]
        }
      } else {
        const { data: fm } = await supabase
          .from('messages')
          .select('content, image_path, sort_order')
          .eq('product_id', sub.product_id)
          .eq('day_number', currentDay)
          .order('sort_order', { ascending: true })
        if (fm?.length) messages = fm
      }

      if (!messages.length) continue

      // 총 발송 건수 계산 (텍스트 + 파일)
      const totalItems = messages.reduce((n, m) => n + 1 + (m.image_path ? 1 : 0), 0)
      let seqNum = 0

      for (const msg of messages) {
        // 텍스트 메시지 행
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
        // 파일이 있으면 별도 행으로 추가
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
}
