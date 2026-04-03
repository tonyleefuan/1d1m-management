import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCsSession } from '@/lib/cs-auth'
import { computeSubscription, todayKST } from '@/lib/day'

export async function GET() {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, product:products(id, title, message_type)')
    .eq('customer_id', session.customerId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

    let dDay: number | null = null
    if (computed.computed_status === 'paused') {
      dDay = null
    } else if (computed.computed_end_date) {
      dDay = Math.ceil((new Date(computed.computed_end_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24))
    }

    return {
      id: sub.id,
      product_id: sub.product_id,
      product: sub.product,
      status: sub.status,
      duration_days: sub.duration_days,
      start_date: sub.start_date,
      current_day: computed.current_day,
      computed_status: computed.computed_status,
      computed_end_date: computed.computed_end_date,
      d_day: dDay,
    }
  })

  return NextResponse.json({ data: enriched, customerName: session.customerName })
}
