import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { sanitizeSearch } from '@/lib/sanitize'
import { computeSubscription, todayKST } from '@/lib/day'

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
  const sortBy = searchParams.get('sort') || 'created_at'
  const sortOrder = searchParams.get('order') || 'desc'
  const ascending = sortOrder === 'asc'

  // 허용된 정렬 필드
  const SORTABLE_FIELDS: Record<string, string> = {
    created_at: 'created_at',
    start_date: 'start_date',
    end_date: 'end_date',
    day: 'last_sent_day',
    status: 'status',
  }
  const sortField = SORTABLE_FIELDS[sortBy] || 'created_at'

  let query = supabase
    .from('subscriptions')
    .select(`
      *,
      customer:customers(id, name, phone, phone_last4, kakao_friend_name),
      product:products(id, sku_code, title, message_type),
      device:send_devices(id, phone_number, name),
      order_item:order_items(order:orders(ordered_at, imweb_order_no))
    `, { count: 'exact' })
    .order(sortField, { ascending, nullsFirst: !ascending })
    .range((page - 1) * limit, page * limit - 1)

  // failure_type 필터: 'failed' → failure_type='failed'인 것만
  const failureFilter = searchParams.get('failure_type') || ''
  if (failureFilter === 'failed') {
    query = query.eq('failure_type', 'failed')
  }

  if (status) query = query.eq('status', status)
  if (deviceId) query = query.eq('device_id', deviceId)
  if (productId) query = query.eq('product_id', productId)
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

  // order_item이 없는 구독에 대해 customer_id로 최신 주문번호 조회
  const noOrderItemCustomerIds = Array.from(new Set(
    data?.filter(sub => !sub.order_item).map(sub => sub.customer_id).filter(Boolean) || []
  ))
  const customerOrderMap = new Map<string, string>()
  if (noOrderItemCustomerIds.length > 0) {
    const { data: customerOrders } = await supabase
      .from('orders')
      .select('customer_id, imweb_order_no')
      .in('customer_id', noOrderItemCustomerIds)
      .order('ordered_at', { ascending: false })
    // 고객별 가장 최신 주문번호만 사용
    customerOrders?.forEach(o => {
      if (!customerOrderMap.has(o.customer_id)) {
        customerOrderMap.set(o.customer_id, o.imweb_order_no)
      }
    })
  }

  const today = todayKST()
  const enriched = data?.map(sub => {
    const computed = computeSubscription({
      start_date: sub.start_date,
      duration_days: sub.duration_days,
      last_sent_day: sub.last_sent_day ?? 0,
      paused_days: sub.paused_days ?? 0,
      paused_at: sub.paused_at,
      is_cancelled: sub.is_cancelled ?? false,
    }, today)

    // D-Day 계산
    let dDay: number | null = null
    if (computed.computed_status === 'paused') {
      dDay = null
    } else if (computed.computed_end_date) {
      dDay = Math.ceil((new Date(computed.computed_end_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
    }

    // order_item이 없는 경우 customer_id 기반 주문번호 매칭
    const matchedOrderNo = sub.order_item?.order?.imweb_order_no
      || customerOrderMap.get(sub.customer_id)
      || null

    return {
      ...sub,
      d_day: dDay,
      is_started: computed.current_day >= 1,
      current_day: computed.current_day,
      computed_status: computed.computed_status,
      computed_end_date: computed.computed_end_date,
      pending_days: computed.pending_days,
      missed_days: computed.missed_days,
      matched_order_no: matchedOrderNo,
    }
  })

  // 발송 오류 건수 (필터와 무관하게 항상 반환)
  const { count: failedCount } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('failure_type', 'failed')
    .eq('is_cancelled', false)

  return NextResponse.json({ data: enriched, total: count, page, limit, failedCount: failedCount ?? 0 })
}
