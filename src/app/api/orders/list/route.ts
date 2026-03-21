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
      order:orders!inner(imweb_order_no, total_amount, ordered_at, customer:customers(name, phone, phone_last4, email)),
      product:products(sku_code, title)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (search) {
    const s = sanitizeSearch(search)
    if (s) query = query.or(`raw_option_name.ilike.%${s}%,imweb_item_no.ilike.%${s}%`)
  }

  const { data, count, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, total: count, page, limit })
}
