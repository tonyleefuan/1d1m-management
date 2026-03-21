import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { sanitizeSearch } from '@/lib/sanitize'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
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
      device:send_devices(id, phone_number, name)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (status) query = query.eq('status', status)
  if (deviceId) query = query.eq('device_id', deviceId)
  if (productId) query = query.eq('product_id', productId)
  if (friendConfirmed === 'true') query = query.eq('friend_confirmed', true)
  if (friendConfirmed === 'false') query = query.eq('friend_confirmed', false)

  if (search) {
    const s = sanitizeSearch(search)
    if (!s) return NextResponse.json({ data: [], total: 0, page, limit })
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .or(`name.ilike.%${s}%,kakao_friend_name.ilike.%${s}%,phone_last4.ilike.%${s}%`)

    if (customers?.length) {
      query = query.in('customer_id', customers.map(c => c.id))
    } else {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // current_day 계산 (start_date 기준)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const enriched = data?.map(sub => {
    let currentDay = sub.current_day
    let dDay = 0
    if (sub.start_date) {
      const start = new Date(sub.start_date)
      start.setHours(0, 0, 0, 0)
      currentDay = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      dDay = sub.duration_days - currentDay
    }
    return { ...sub, current_day: currentDay, d_day: dDay }
  })

  return NextResponse.json({ data: enriched, total: count, page, limit })
}
