import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { sanitizeSearch } from '@/lib/sanitize'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '50')), 200)
  const status = searchParams.get('status') || ''
  const deviceId = searchParams.get('device_id') || ''
  const productId = searchParams.get('product_id') || ''
  const search = searchParams.get('search') || ''
  const friendConfirmed = searchParams.get('friend_confirmed')

  let query = supabase
    .from('subscriptions')
    .select(`
      *,
      customer:customers(id, name, phone, phone_last4, kakao_friend_name, email),
      product:products(id, sku_code, title, message_type),
      device:send_devices(id, phone_number, name),
      order_item:order_items(order:orders(ordered_at))
    `, { count: 'exact' })
    .order('start_date', { ascending: false, nullsFirst: true })
    .range((page - 1) * limit, page * limit - 1)

  if (status) query = query.eq('status', status)
  if (deviceId) query = query.eq('device_id', deviceId)
  if (productId) query = query.eq('product_id', productId)
  if (friendConfirmed === 'true') query = query.eq('friend_confirmed', true)
  if (friendConfirmed === 'false') query = query.eq('friend_confirmed', false)

  if (search) {
    const s = sanitizeSearch(search)
    if (!s) return NextResponse.json({ data: [], total: 0, page, limit })
    // ILIKE 와일드카드 이스케이프
    const escaped = s.replace(/%/g, '\\%').replace(/_/g, '\\_')
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .or(`name.ilike.%${escaped}%,kakao_friend_name.ilike.%${escaped}%,phone_last4.ilike.%${escaped}%`)
      .limit(500)

    if (customers?.length) {
      query = query.in('customer_id', customers.map(c => c.id))
    } else {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // day: DB 저장값 사용 (발송 성공 시에만 +1)
  // d_day: end_date - 오늘 (pause 중이면 "일시정지")
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const enriched = data?.map(sub => {
    let dDay: number | null = null
    if (sub.status === 'pause') {
      dDay = null // UI에서 "일시정지" 표시
    } else if (sub.end_date) {
      const end = new Date(sub.end_date)
      end.setHours(0, 0, 0, 0)
      dDay = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    }
    const isStarted = sub.start_date ? new Date(sub.start_date) <= today : false
    return { ...sub, d_day: dDay, is_started: isStarted }
  })

  return NextResponse.json({ data: enriched, total: count, page, limit })
}
