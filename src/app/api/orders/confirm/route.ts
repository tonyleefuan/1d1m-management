import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { items } = await req.json()
    if (!items?.length) return NextResponse.json({ error: '저장할 주문이 없습니다' }, { status: 400 })

    // 1. Product map (한 번만 조회)
    const skuCodes = Array.from(new Set(items.map((i: any) => i.product_sku)))
    const { data: products } = await supabase
      .from('products')
      .select('id, sku_code')
      .in('sku_code', skuCodes)
    const productMap = new Map(products?.map(p => [p.sku_code, p.id]) || [])

    // 2. 고객 일괄 처리 — 전화번호 기준 dedup
    const phoneToItem = new Map<string, any>()
    for (const item of items) {
      if (item.customer_phone && !phoneToItem.has(item.customer_phone)) {
        phoneToItem.set(item.customer_phone, item)
      }
    }

    // 기존 고객 조회
    const phones = Array.from(phoneToItem.keys())
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, phone')
      .in('phone', phones)
    const phoneToId = new Map(existingCustomers?.map(c => [c.phone, c.id]) || [])

    // 새 고객 일괄 생성
    const newCustomerRows = phones
      .filter(phone => !phoneToId.has(phone))
      .map(phone => {
        const item = phoneToItem.get(phone)!
        return {
          name: item.customer_name,
          phone,
          phone_last4: phone.slice(-4),
          kakao_friend_name: item.customer_name + '/' + phone.slice(-4),
          email: item.customer_email || null,
        }
      })

    if (newCustomerRows.length > 0) {
      const { data: newCustomers, error: custErr } = await supabase
        .from('customers')
        .insert(newCustomerRows)
        .select('id, phone')
      if (custErr) {
        return NextResponse.json({ error: `고객 생성 실패: ${custErr.message}` }, { status: 500 })
      }
      newCustomers?.forEach(c => phoneToId.set(c.phone, c.id))
    }

    // 3. 주문 일괄 생성 — 주문번호 기준 그룹
    const orderGroups = new Map<string, any[]>()
    for (const item of items) {
      const group = orderGroups.get(item.imweb_order_no) || []
      group.push(item)
      orderGroups.set(item.imweb_order_no, group)
    }

    const orderRows = Array.from(orderGroups.entries()).map(([orderNo, orderItems]) => {
      const first = orderItems[0]
      return {
        imweb_order_no: orderNo,
        customer_id: phoneToId.get(first.customer_phone),
        total_amount: first.total_amount,
        ordered_at: first.ordered_at,
      }
    }).filter(o => o.customer_id)

    const { data: orders, error: orderErr } = await supabase
      .from('orders')
      .upsert(orderRows, { onConflict: 'imweb_order_no', ignoreDuplicates: true })
      .select('id, imweb_order_no')

    if (orderErr) {
      return NextResponse.json({ error: `주문 생성 실패: ${orderErr.message}` }, { status: 500 })
    }

    // 기존 주문도 가져오기 (upsert에서 ignored된 것들)
    const orderNos = Array.from(orderGroups.keys())
    const { data: allOrders } = await supabase
      .from('orders')
      .select('id, imweb_order_no')
      .in('imweb_order_no', orderNos)
    const orderNoToId = new Map(allOrders?.map(o => [o.imweb_order_no, o.id]) || [])

    // 4. 품목 일괄 생성
    const itemRows = items
      .filter((item: any) => productMap.has(item.product_sku) && orderNoToId.has(item.imweb_order_no))
      .map((item: any) => ({
        order_id: orderNoToId.get(item.imweb_order_no),
        imweb_item_no: item.imweb_item_no,
        product_id: productMap.get(item.product_sku),
        duration_days: item.duration_days,
        channel: item.channel,
        list_price: item.list_price || 0,
        allocated_amount: item.allocated_amount || 0,
        is_addon: item.is_addon,
        raw_product_sku: item.raw_product_sku,
        raw_option_sku: item.raw_option_sku,
        raw_option_name: item.raw_option_name,
      }))

    const { data: savedItems, error: itemErr } = await supabase
      .from('order_items')
      .upsert(itemRows, { onConflict: 'imweb_item_no', ignoreDuplicates: true })
      .select('id, product_id, imweb_item_no')

    if (itemErr) {
      return NextResponse.json({ error: `품목 생성 실패: ${itemErr.message}` }, { status: 500 })
    }

    // 5. 구독 일괄 생성
    const itemNoToSaved = new Map(savedItems?.map(si => [si.imweb_item_no, si]) || [])
    const subRows = items
      .filter((item: any) => {
        const saved = itemNoToSaved.get(item.imweb_item_no)
        return saved && productMap.has(item.product_sku) && phoneToId.has(item.customer_phone)
      })
      .map((item: any) => {
        // 시작일 = 주문일 다음 날
        const orderedAt = item.ordered_at ? new Date(item.ordered_at) : new Date()
        const startDate = new Date(orderedAt)
        startDate.setDate(startDate.getDate() + 1)
        const startStr = startDate.toISOString().slice(0, 10)
        // 종료일 = 시작일 + 기간 - 1
        const endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + (item.duration_days || 365) - 1)
        const endStr = endDate.toISOString().slice(0, 10)

        return {
          order_item_id: itemNoToSaved.get(item.imweb_item_no)!.id,
          customer_id: phoneToId.get(item.customer_phone),
          product_id: productMap.get(item.product_sku),
          status: 'pending',
          duration_days: item.duration_days,
          start_date: startStr,
          end_date: endStr,
        }
      })

    if (subRows.length > 0) {
      const { error: subErr } = await supabase
        .from('subscriptions')
        .insert(subRows)

      if (subErr) {
        return NextResponse.json({ error: `구독 생성 실패: ${subErr.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      saved_orders: orders?.length || 0,
      saved_items: savedItems?.length || 0,
      saved_subscriptions: subRows.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
