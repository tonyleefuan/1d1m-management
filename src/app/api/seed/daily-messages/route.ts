import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

/**
 * 실시간 메시지 히스토리 일괄 임포트 API
 * POST /api/seed/daily-messages
 * admin 전용
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { messages } = await req.json() as {
      messages: {
        sku_code: string
        send_date: string
        content: string
      }[]
    }

    if (!messages?.length) return NextResponse.json({ error: 'No messages' }, { status: 400 })

    // Get product map
    const skuCodes = [...new Set(messages.map(m => m.sku_code))]
    const { data: products } = await supabase
      .from('products')
      .select('id, sku_code')
      .in('sku_code', skuCodes)

    const productMap = new Map(products?.map(p => [p.sku_code, p.id]) || [])

    let created = 0
    let skipped = 0
    const errors: string[] = []

    for (const msg of messages) {
      const productId = productMap.get(msg.sku_code)
      if (!productId) {
        errors.push(`${msg.sku_code}: 상품이 존재하지 않습니다`)
        continue
      }

      // Check duplicate
      const { data: existing } = await supabase
        .from('daily_messages')
        .select('id')
        .eq('product_id', productId)
        .eq('send_date', msg.send_date)
        .limit(1)

      if (existing?.length) {
        skipped++
        continue
      }

      const { error } = await supabase
        .from('daily_messages')
        .insert({
          product_id: productId,
          send_date: msg.send_date,
          content: msg.content,
          created_by: session.userId,
        })

      if (error) {
        errors.push(`${msg.sku_code}/${msg.send_date}: ${error.message}`)
      } else {
        created++
      }
    }

    return NextResponse.json({ ok: true, created, skipped, errors: errors.length ? errors : undefined })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
