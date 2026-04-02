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

  // Message cache
  const msgCache = new Map<string, any[]>()

  async function getMessages(productId: string, messageType: string, day: number) {
    const key = `${productId}:${day}:${messageType}`
    if (msgCache.has(key)) return msgCache.get(key)!

    let messages: any[] = []
    if (messageType === 'realtime') {
      const { data } = await supabase
        .from('daily_messages')
        .select('content, image_path')
        .eq('product_id', productId)
        .eq('send_date', t)
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

  // Filter and compute
  const activeSubs = subs.filter(sub => {
    if (sub.failure_type === 'failed') return false

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

      let daysToSend: number[]
      if (sub.recovery_mode === 'bulk') {
        daysToSend = computed.pending_days
      } else if (sub.recovery_mode === 'sequential') {
        daysToSend = [(sub.last_sent_day ?? 0) + 1]
      } else {
        daysToSend = computed.pending_days.slice(0, 2)
      }

      for (const dayNum of daysToSend) {
        if (dayNum < 1 || dayNum > sub.duration_days) continue
        const product = sub.product as any
        const messages = await getMessages(sub.product_id, product?.message_type, dayNum)
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
          })
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
