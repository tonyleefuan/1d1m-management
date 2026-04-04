import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCsSession } from '@/lib/cs-auth'

// GET: 선택한 구독과 동일 가격의 변경 가능 상품 목록
export async function GET(req: Request) {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const subscriptionId = searchParams.get('subscription_id')
  if (!subscriptionId) return NextResponse.json({ data: [] })

  // 1. 구독 + 현재 상품 조회 (본인 소유 확인)
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id, product_id, customer_id')
    .eq('id', subscriptionId)
    .eq('customer_id', session.customerId)
    .single()

  if (!sub) return NextResponse.json({ data: [] })

  // 2. 현재 상품의 가격 조회
  const { data: currentPrices } = await supabase
    .from('product_prices')
    .select('duration_days, channel, price')
    .eq('product_id', sub.product_id)

  if (!currentPrices?.length) return NextResponse.json({ data: [] })

  // 3. 모든 활성 상품 + 가격 조회
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, title, sku_code, prices:product_prices(duration_days, channel, price)')
    .eq('is_active', true)
    .neq('id', sub.product_id) // 현재 상품 제외

  if (!allProducts?.length) return NextResponse.json({ data: [] })

  // 4. 동일 가격 상품 필터링 (duration_days + channel + price 일치)
  const matchingProducts = allProducts.filter(prod => {
    const prices = (prod as any).prices || []
    return currentPrices.some(cp =>
      prices.some((pp: any) =>
        cp.duration_days === pp.duration_days &&
        cp.channel === pp.channel &&
        cp.price === pp.price
      )
    )
  })

  return NextResponse.json({
    data: matchingProducts.map(p => ({
      id: p.id,
      title: p.title,
      sku_code: p.sku_code,
    })),
  })
}
