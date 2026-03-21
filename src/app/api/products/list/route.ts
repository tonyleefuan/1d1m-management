import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { naturalSortBy } from '@/lib/utils'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      *,
      product_prices (*)
    `)
    .order('sku_code')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 각 상품별 활성 구독 수 가져오기
  const { data: subCounts } = await supabase
    .from('subscriptions')
    .select('product_id')
    .eq('status', 'live')

  const countMap: Record<string, number> = {}
  subCounts?.forEach(s => {
    countMap[s.product_id] = (countMap[s.product_id] || 0) + 1
  })

  const result = products?.map(p => ({
    ...p,
    active_subscriptions: countMap[p.id] || 0,
  }))

  return NextResponse.json(naturalSortBy(result || [], 'sku_code'))
}
