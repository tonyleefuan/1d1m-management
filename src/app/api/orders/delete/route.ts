import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids } = await req.json()
  if (!ids?.length) return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })

  // 1. Delete related subscriptions
  await supabase.from('subscriptions').delete().in('order_item_id', ids)

  // 2. Get order_ids before deleting items
  const { data: items } = await supabase
    .from('order_items').select('order_id').in('id', ids)
  const orderIds = [...new Set(items?.map(i => i.order_id) || [])]

  // 3. Delete order items
  const { error } = await supabase.from('order_items').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 4. Clean up empty orders
  for (const orderId of orderIds) {
    const { count } = await supabase
      .from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId)
    if (count === 0) {
      await supabase.from('orders').delete().eq('id', orderId)
    }
  }

  return NextResponse.json({ ok: true, deleted: ids.length })
}
