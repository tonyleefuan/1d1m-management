import { supabase } from '@/lib/supabase'
import { computeSubscription, todayKST } from '@/lib/day'

export async function generateQueueForDevice(deviceId: string, today?: string) {
  const t = today || todayKST()

  // Check if queue already exists for this device today
  const { data: existing } = await supabase
    .from('send_queues')
    .select('*')
    .eq('device_id', deviceId)
    .eq('send_date', t)
    .order('sort_order', { ascending: true })

  if (existing && existing.length > 0) {
    return { data: existing, generated: false }
  }

  // Get active subscriptions for this device
  const { data: subs, error: subErr } = await supabase
    .from('subscriptions')
    .select(`
      id, customer_id, product_id, device_id,
      start_date, duration_days, last_sent_day, paused_days, paused_at,
      is_cancelled, failure_type, recovery_mode, send_priority,
      customer:customers(kakao_friend_name),
      product:products(sku_code, message_type)
    `)
    .eq('device_id', deviceId)
    .eq('is_cancelled', false)
    .is('paused_at', null)

  if (subErr) return { error: subErr.message }
  if (!subs?.length) return { data: [], generated: true }

  // Notice template cache (fetched once, keyed by notice_type)
  const noticeCache = new Map<string, any[]>()

  async function getNoticeTemplate(noticeType: string, productId: string): Promise<{ content: string; image_path: string | null } | null> {
    if (!noticeCache.has(noticeType)) {
      const { data } = await supabase
        .from('notice_templates')
        .select('product_id, content, image_path')
        .eq('notice_type', noticeType)
      noticeCache.set(noticeType, data || [])
    }
    const templates = noticeCache.get(noticeType)!
    // Product-specific takes priority over generic (product_id IS NULL)
    const specific = templates.find(t => t.product_id === productId)
    if (specific) return { content: specific.content, image_path: specific.image_path }
    const generic = templates.find(t => t.product_id === null)
    if (generic) return { content: generic.content, image_path: generic.image_path }
    return null
  }

  // Message cache
  const msgCache = new Map<string, any[]>()

  async function getMessages(productId: string, messageType: string, day: number, sendDateForDay?: string) {
    const key = `${productId}:${day}:${messageType}:${sendDateForDay || t}`
    if (msgCache.has(key)) return msgCache.get(key)!

    let messages: any[] = []
    if (messageType === 'realtime') {
      // 밀린 Day는 해당 날짜의 콘텐츠를 조회 (오늘만이 아닌)
      const targetDate = sendDateForDay || t
      const { data } = await supabase
        .from('daily_messages')
        .select('content, image_path')
        .eq('product_id', productId)
        .eq('send_date', targetDate)
        .limit(1)
      if (data?.length) messages = [{ content: data[0].content, image_path: data[0].image_path, sort_order: 1 }]
    } else {
      const { data } = await supabase
        .from('messages')
        .select('content, image_path, sort_order')
        .eq('product_id', productId)
        .eq('day_number', day)
        .order('sort_order', { ascending: true })
      if (data?.length) messages = data
    }
    msgCache.set(key, messages)
    return messages
  }

  // Filter and compute (실패 구독도 포함 — 다음 발송 시 자동 재발송)
  const activeSubs = subs.filter(sub => {
    const computed = computeSubscription({
      start_date: sub.start_date,
      duration_days: sub.duration_days,
      last_sent_day: sub.last_sent_day ?? 0,
      paused_days: sub.paused_days ?? 0,
      paused_at: sub.paused_at,
      is_cancelled: sub.is_cancelled ?? false,
    }, t)

    if (computed.computed_status !== 'active') return false

    const pendingCount = computed.pending_days.length
    if (pendingCount === 0) return false
    if (sub.recovery_mode === null && pendingCount >= 3) return false

    return true
  })

  // Group by person, sort by send_priority
  const personGroups = new Map<string, typeof activeSubs>()
  const sorted = activeSubs.sort((a, b) => (a.send_priority || 3) - (b.send_priority || 3))

  for (const sub of sorted) {
    const group = personGroups.get(sub.customer_id) || []
    group.push(sub)
    personGroups.set(sub.customer_id, group)
  }

  // Generate queue rows
  const queueRows: any[] = []
  let sortOrder = 0
  const failedSubIds: string[] = [] // 실패 → 재발송 대상 추적
  const retryNotifiedNames = new Set<string>() // 알림 중복 방지: 카톡이름당 1번

  for (const [_customerId, personSubs] of personGroups) {
    for (const sub of personSubs) {
      const friendName = (sub.customer as any)?.kakao_friend_name || 'unknown'
      const computed = computeSubscription({
        start_date: sub.start_date,
        duration_days: sub.duration_days,
        last_sent_day: sub.last_sent_day ?? 0,
        paused_days: sub.paused_days ?? 0,
        paused_at: sub.paused_at,
        is_cancelled: sub.is_cancelled ?? false,
      }, t)

      const isFailureRetry = sub.failure_type === 'failed'
      if (isFailureRetry) failedSubIds.push(sub.id)

      let daysToSend: number[]
      if (sub.recovery_mode === 'bulk') {
        daysToSend = computed.pending_days
      } else if (sub.recovery_mode === 'sequential') {
        daysToSend = [(sub.last_sent_day ?? 0) + 1]
      } else {
        daysToSend = computed.pending_days.slice(0, 2)
      }

      let retryNoticePushed = false
      for (const dayNum of daysToSend) {
        if (dayNum < 1 || dayNum > sub.duration_days) continue

        // 실패 재발송 알림 (카톡이름당 한 번만, 첫 유효 Day 앞에)
        if (isFailureRetry && !retryNoticePushed && !retryNotifiedNames.has(friendName)) {
          retryNoticePushed = true
          retryNotifiedNames.add(friendName)
          const retryNotice = await getNoticeTemplate('failure_retry_next', sub.product_id)
          if (retryNotice) {
            sortOrder++
            queueRows.push({
              subscription_id: sub.id,
              device_id: deviceId,
              send_date: t,
              day_number: dayNum,
              kakao_friend_name: friendName,
              message_content: retryNotice.content,
              image_path: retryNotice.image_path || null,
              sort_order: sortOrder,
              message_seq: null,
              status: 'pending',
              is_notice: true,
            })
          }
        }

        // Start notice: insert before Day 1 message
        if (dayNum === 1) {
          const startNotice = await getNoticeTemplate('start', sub.product_id)
          if (startNotice) {
            sortOrder++
            queueRows.push({
              subscription_id: sub.id,
              device_id: deviceId,
              send_date: t,
              day_number: 0,
              kakao_friend_name: friendName,
              message_content: startNotice.content,
              image_path: startNotice.image_path || null,
              sort_order: sortOrder,
              message_seq: null,
              status: 'pending',
              is_notice: true,
            })
          }
        }

        const product = sub.product as any
        // 실시간 메시지: 밀린 Day의 실제 날짜 콘텐츠 조회
        let sendDateForDay: string | undefined
        if (product?.message_type === 'realtime') {
          const daysAgo = computed.current_day - dayNum
          const d = new Date(t)
          d.setUTCDate(d.getUTCDate() - daysAgo)
          sendDateForDay = d.toISOString().slice(0, 10)
        }
        const messages = await getMessages(sub.product_id, product?.message_type, dayNum, sendDateForDay)
        if (!messages.length) continue

        for (const msg of messages) {
          sortOrder++
          queueRows.push({
            subscription_id: sub.id,
            device_id: deviceId,
            send_date: t,
            day_number: dayNum,
            kakao_friend_name: friendName,
            message_content: msg.content || '',
            image_path: msg.image_path || null,
            sort_order: sortOrder,
            status: 'pending',
            is_notice: false,
          })
        }

        // End notice: insert after last day message
        if (dayNum === sub.duration_days) {
          const endNotice = await getNoticeTemplate('end', sub.product_id)
          if (endNotice) {
            sortOrder++
            queueRows.push({
              subscription_id: sub.id,
              device_id: deviceId,
              send_date: t,
              day_number: sub.duration_days + 1,
              kakao_friend_name: friendName,
              message_content: endNotice.content,
              image_path: endNotice.image_path || null,
              sort_order: sortOrder,
              message_seq: null,
              status: 'pending',
              is_notice: true,
            })
          }
        }
      }
    }
  }

  // Batch insert + ID 반환
  if (queueRows.length > 0) {
    for (let i = 0; i < queueRows.length; i += 500) {
      const batch = queueRows.slice(i, i + 500)
      const { error } = await supabase.from('send_queues').insert(batch)
      if (error) return { error: `대기열 생성 실패: ${error.message}` }
    }

    // 실패 재발송 대상 구독의 failure flags 클리어
    if (failedSubIds.length > 0) {
      await supabase.from('subscriptions').update({
        failure_type: null,
        failure_date: null,
        updated_at: new Date().toISOString(),
      }).in('id', failedSubIds)
    }

    // 삽입된 행을 ID와 함께 다시 조회
    const { data: inserted } = await supabase
      .from('send_queues')
      .select('*')
      .eq('device_id', deviceId)
      .eq('send_date', t)
      .order('sort_order', { ascending: true })

    return { data: inserted || [], generated: true }
  }

  return { data: [], generated: true }
}
