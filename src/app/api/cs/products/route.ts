export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCsSession } from '@/lib/cs-auth'

/**
 * GET /api/cs/products?subscription_id=xxx
 * 고객의 특정 구독과 동일 가격인 상품 목록을 반환한다.
 * (상품 변경 시 선택지 제공용)
 */
export async function GET(req: NextRequest) {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const subscriptionId = req.nextUrl.searchParams.get('subscription_id')
  if (!subscriptionId) {
    return NextResponse.json({ error: 'subscription_id required' }, { status: 400 })
  }

  // 1) 해당 구독이 본인 것인지 확인 + 현재 상품/기간 조회
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('id, product_id, duration_days')
    .eq('id', subscriptionId)
    .eq('customer_id', session.customerId)
    .single()

  if (subErr || !sub) {
    return NextResponse.json({ error: '구독을 찾을 수 없습니다' }, { status: 404 })
  }

  // 2) 현재 상품의 가격 조회
  const { data: currentPrice } = await supabase
    .from('product_prices')
    .select('price')
    .eq('product_id', sub.product_id)
    .eq('duration_days', sub.duration_days)
    .limit(1)
    .single()

  if (!currentPrice) {
    return NextResponse.json({ data: [], currentPrice: null })
  }

  // 3) 동일 가격 + 동일 기간의 다른 상품 조회
  const { data: samePricePrices } = await supabase
    .from('product_prices')
    .select('product_id')
    .eq('price', currentPrice.price)
    .eq('duration_days', sub.duration_days)
    .neq('product_id', sub.product_id)

  const productIds = samePricePrices?.map(p => p.product_id) || []

  if (productIds.length === 0) {
    return NextResponse.json({ data: [], currentPrice: currentPrice.price })
  }

  // 4) 상품 상세 조회
  const { data: products } = await supabase
    .from('products')
    .select('id, title, sku_code')
    .in('id', productIds)
    .eq('is_active', true)
    .order('title')

  return NextResponse.json({
    data: products || [],
    currentPrice: currentPrice.price,
  })
}
