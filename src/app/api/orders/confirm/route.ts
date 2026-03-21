import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { items } = await req.json()
    if (!items?.length) return NextResponse.json({ error: '저장할 주문이 없습니다' }, { status: 400 })

    let savedOrders = 0
    let savedItems = 0
    let savedSubscriptions = 0

    // Get product map
    const skuCodes = Array.from(new Set(items.map((i: any) => i.product_sku)))
    const { data: products } = await supabase
      .from('products')
      .select('id, sku_code')
      .in('sku_code', skuCodes)
    const productMap = new Map(products?.map(p => [p.sku_code, p.id]) || [])

    // Group by order_no
    const orderGroups = new Map<string, any[]>()
    for (const item of items) {
      const group = orderGroups.get(item.imweb_order_no) || []
      group.push(item)
      orderGroups.set(item.imweb_order_no, group)
    }

    for (const [orderNo, orderItems] of orderGroups) {
      const first = orderItems[0]

      // 1. Find or create customer (upsert-style to avoid race conditions)
      let customerId: string
      const phoneLast4 = first.customer_phone?.slice(-4) || ''

      // Try find first
      const { data: existingCustomers } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', first.customer_phone)
        .limit(1)

      if (existingCustomers?.length) {
        customerId = existingCustomers[0].id
      } else {
        // Insert, handle duplicate gracefully
        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({
            name: first.customer_name,
            phone: first.customer_phone,
            phone_last4: phoneLast4,
            email: first.customer_email || null,
          })
          .select('id')
          .single()

        if (custError) {
          // If duplicate from race condition, try to find again
          const { data: retryCustomer } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', first.customer_phone)
            .limit(1)
          if (retryCustomer?.length) {
            customerId = retryCustomer[0].id
          } else {
            console.error('Customer insert error:', custError)
            continue
          }
        } else {
          customerId = newCustomer.id
        }
      }

      // 2. Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          imweb_order_no: orderNo,
          customer_id: customerId,
          total_amount: first.total_amount,
          ordered_at: first.ordered_at,
        })
        .select('id')
        .single()

      if (orderError) {
        if (orderError.code === '23505') continue // duplicate order
        console.error('Order insert error:', orderError)
        continue
      }
      savedOrders++

      // 3. Create order items + subscriptions
      for (const item of orderItems) {
        const productId = productMap.get(item.product_sku)
        if (!productId) continue

        const { data: orderItem, error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: order.id,
            imweb_item_no: item.imweb_item_no,
            product_id: productId,
            duration_days: item.duration_days,
            channel: item.channel,
            list_price: item.list_price || 0,
            allocated_amount: item.allocated_amount || 0,
            is_addon: item.is_addon,
            raw_product_sku: item.raw_product_sku,
            raw_option_sku: item.raw_option_sku,
            raw_option_name: item.raw_option_name,
          })
          .select('id')
          .single()

        if (itemError) {
          if (itemError.code === '23505') continue
          console.error('Item insert error:', itemError)
          continue
        }
        savedItems++

        // 4. Create subscription (pending status)
        const { error: subError } = await supabase
          .from('subscriptions')
          .insert({
            order_item_id: orderItem.id,
            customer_id: customerId,
            product_id: productId,
            status: 'pending',
            duration_days: item.duration_days,
          })

        if (!subError) savedSubscriptions++
      }
    }

    return NextResponse.json({
      ok: true,
      saved_orders: savedOrders,
      saved_items: savedItems,
      saved_subscriptions: savedSubscriptions,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
