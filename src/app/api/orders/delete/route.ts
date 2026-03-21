import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: '한 번에 최대 500건까지 삭제 가능합니다' }, { status: 400 })
  }

  // 1. Fetch order_ids FIRST (before any deletions)
  const { data: items } = await supabase
    .from('order_items').select('order_id').in('id', ids)
  const orderIds = [...new Set(items?.map(i => i.order_id) || [])]

  // 2. Delete related subscriptions (cascade will handle send_queues/send_logs)
  const { error: subError } = await supabase
    .from('subscriptions').delete().in('order_item_id', ids)
  if (subError) return NextResponse.json({ error: `구독 삭제 실패: ${subError.message}` }, { status: 500 })

  // 3. Delete order items
  const { error: itemError } = await supabase
    .from('order_items').delete().in('id', ids)
  if (itemError) return NextResponse.json({ error: `주문 품목 삭제 실패: ${itemError.message}` }, { status: 500 })

  // 4. Clean up empty orders (batch approach)
  if (orderIds.length > 0) {
    // Find orders that still have items
    const { data: ordersWithItems } = await supabase
      .from('order_items')
      .select('order_id')
      .in('order_id', orderIds)
    const ordersStillHaveItems = new Set(ordersWithItems?.map(o => o.order_id) || [])
    const emptyOrderIds = orderIds.filter(id => !ordersStillHaveItems.has(id))

    if (emptyOrderIds.length > 0) {
      await supabase.from('orders').delete().in('id', emptyOrderIds)
    }
  }

  return NextResponse.json({ ok: true, deleted: ids.length })
}
