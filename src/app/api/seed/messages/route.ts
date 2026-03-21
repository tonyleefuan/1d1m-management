import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

/**
 * 고정 메시지 일괄 임포트 API
 * POST /api/seed/messages
 * body: { messages: [{ sku_code, day_number, content, image_path? }] }
 * 배치당 최대 200건
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { messages } = await req.json() as {
      messages: {
        sku_code: string
        day_number: number
        sort_order?: number
        content: string
        image_path?: string
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

    // Batch insert (upsert by product_id + day_number)
    const rows = messages
      .filter(m => productMap.has(m.sku_code))
      .map(m => ({
        product_id: productMap.get(m.sku_code)!,
        day_number: m.day_number,
        sort_order: m.sort_order || 1,
        content: m.content,
        image_path: m.image_path || null,
      }))

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, created: 0, skipped: 0, error_skus: skuCodes.filter(s => !productMap.has(s)) })
    }

    const { data, error } = await supabase
      .from('messages')
      .upsert(rows, { onConflict: 'product_id,day_number,sort_order' })
      .select('id')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      created: data?.length || 0,
      error_skus: skuCodes.filter(s => !productMap.has(s)),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
