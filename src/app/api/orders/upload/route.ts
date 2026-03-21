import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { parseOrderRows, type ParsedOrderItem } from '@/lib/order-parser'
import * as XLSX from 'xlsx'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: '파일을 선택해주세요' }, { status: 400 })

    // File validation
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 10MB 이하만 가능합니다' }, { status: 400 })
    }

    // Parse Excel
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(sheet) as any[]

    if (rawRows.length === 0) {
      return NextResponse.json({ error: '데이터가 없습니다' }, { status: 400 })
    }

    // Parse order rows
    const parsedItems = parseOrderRows(rawRows)
    if (parsedItems.length === 0) {
      return NextResponse.json({ error: '유효한 주문 데이터가 없습니다' }, { status: 400 })
    }

    // Check for duplicates
    const itemNos = parsedItems.map(i => i.imweb_item_no)
    const { data: existing } = await supabase
      .from('order_items')
      .select('imweb_item_no')
      .in('imweb_item_no', itemNos)

    const existingSet = new Set(existing?.map(e => e.imweb_item_no) || [])
    const newItems = parsedItems.filter(i => !existingSet.has(i.imweb_item_no))
    const duplicateItems = parsedItems.filter(i => existingSet.has(i.imweb_item_no))

    // Get product map (sku_code → product)
    const skuCodes = Array.from(new Set(newItems.map(i => i.product_sku)))
    const { data: products } = await supabase
      .from('products')
      .select('id, sku_code, product_prices(*)')
      .in('sku_code', skuCodes)

    const productMap = new Map(products?.map(p => [p.sku_code, p]) || [])

    // Resolve duration_days for items that need max duration
    for (const item of newItems) {
      if (!item.duration_days) {
        const product = productMap.get(item.product_sku)
        if (product?.product_prices?.length) {
          const maxDuration = Math.max(...product.product_prices.map((p: any) => p.duration_days))
          item.duration_days = maxDuration
        } else {
          item.duration_days = 365 // fallback
        }
      }
    }

    // Check for unknown SKUs
    const unknownSkus = skuCodes.filter(sku => !productMap.has(sku))

    // Group by order_no for amount allocation
    const orderGroups = new Map<string, ParsedOrderItem[]>()
    for (const item of newItems) {
      const group = orderGroups.get(item.imweb_order_no) || []
      group.push(item)
      orderGroups.set(item.imweb_order_no, group)
    }

    // Calculate allocated amounts
    for (const [, items] of orderGroups) {
      const totalAmount = items[0].total_amount
      // Get list prices
      let listPriceSum = 0
      const listPrices: number[] = []

      for (const item of items) {
        const product = productMap.get(item.product_sku)
        const priceEntry = product?.product_prices?.find(
          (p: any) => p.duration_days === item.duration_days && p.channel === item.channel
        ) || product?.product_prices?.[0]
        const listPrice = priceEntry?.price || 0
        listPrices.push(listPrice)
        listPriceSum += listPrice
      }

      // Allocate proportionally
      for (let i = 0; i < items.length; i++) {
        ;(items[i] as any)._list_price = listPrices[i]
        ;(items[i] as any)._allocated = listPriceSum > 0
          ? Math.round(totalAmount * (listPrices[i] / listPriceSum))
          : Math.round(totalAmount / items.length)
      }
    }

    return NextResponse.json({
      total: parsedItems.length,
      new_count: newItems.length,
      duplicate_count: duplicateItems.length,
      unknown_skus: unknownSkus,
      items: newItems.map(item => ({
        ...item,
        list_price: (item as any)._list_price || 0,
        allocated_amount: (item as any)._allocated || 0,
        product_title: productMap.get(item.product_sku)?.sku_code
          ? `${item.product_sku}` : `${item.product_sku} (미등록)`,
      })),
      duplicates: duplicateItems.map(d => d.imweb_item_no),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '파싱 오류가 발생했습니다' }, { status: 500 })
  }
}
