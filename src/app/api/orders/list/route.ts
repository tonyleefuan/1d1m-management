export const dynamic = 'force-dynamic'
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
  const search = searchParams.get('search') || ''

  let query = supabase
    .from('order_items')
    .select(`
      *,
      order:orders!inner(imweb_order_no, total_amount, ordered_at, customer:customers(name, phone, phone_last4)),
      product:products(sku_code, title)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (search) {
    const s = sanitizeSearch(search)
    if (s) {
      const escaped = s.replace(/%/g, '\\%').replace(/_/g, '\\_')
      // 고객명으로 검색 시 customer_id 필터
      const { data: customers } = await supabase
        .from('customers')
        .select('id')
        .ilike('name', `%${escaped}%`)
        .limit(200)

      if (customers?.length) {
        // 고객명 OR 주문번호 OR 옵션명으로 검색
        const customerIds = customers.map(c => c.id)
        const { data: orderIds } = await supabase
          .from('orders')
          .select('id')
          .in('customer_id', customerIds)

        if (orderIds?.length) {
          query = query.or(`order_id.in.(${orderIds.map(o => o.id).join(',')}),raw_option_name.ilike.%${escaped}%,imweb_item_no.ilike.%${escaped}%`)
        } else {
          query = query.or(`raw_option_name.ilike.%${escaped}%,imweb_item_no.ilike.%${escaped}%`)
        }
      } else {
        query = query.or(`raw_option_name.ilike.%${escaped}%,imweb_item_no.ilike.%${escaped}%`)
      }
    }
  }

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ordered_at(주문일) 기준 최신순 정렬 (Supabase에서 조인 컬럼 정렬 불가하므로 서버에서 정렬)
  const sorted = (data || []).sort((a: any, b: any) => {
    const dateA = a.order?.ordered_at || ''
    const dateB = b.order?.ordered_at || ''
    return dateB.localeCompare(dateA)
  })

  return NextResponse.json({ data: sorted, total: count, page, limit })
}
