import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

/**
 * 상품 시드 데이터 일괄 등록 API
 * POST /api/seed/products
 * admin 전용
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { products } = await req.json() as {
      products: {
        sku_code: string
        title: string
        message_type: 'fixed' | 'realtime'
        prices: { duration_days: number; price: number }[]
      }[]
    }

    if (!products?.length) return NextResponse.json({ error: 'No products' }, { status: 400 })

    let created = 0
    let skipped = 0
    const errors: string[] = []

    for (const p of products) {
      // Check if exists
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('sku_code', p.sku_code)
        .limit(1)

      if (existing?.length) {
        skipped++
        continue
      }

      // Insert product
      const { data: newProduct, error: prodErr } = await supabase
        .from('products')
        .insert({
          sku_code: p.sku_code,
          title: p.title,
          message_type: p.message_type,
          is_active: true,
        })
        .select('id')
        .single()

      if (prodErr) {
        errors.push(`${p.sku_code}: ${prodErr.message}`)
        continue
      }

      // Insert prices
      if (p.prices.length > 0) {
        const priceRows = p.prices.map(pr => ({
          product_id: newProduct.id,
          duration_days: pr.duration_days,
          price: pr.price,
        }))
        const { error: priceError } = await supabase.from('product_prices').insert(priceRows)
        if (priceError) {
          errors.push(`${p.sku_code} 가격 저장 실패: ${priceError.message}`)
        }
      }

      created++
    }

    return NextResponse.json({ ok: true, created, skipped, errors: errors.length ? errors : undefined })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
