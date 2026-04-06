export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { id, sku_code, title, message_type, total_days, description, is_active, prices } = body

    if (!sku_code || !title) {
      return NextResponse.json({ error: 'SKU와 상품명은 필수입니다' }, { status: 400 })
    }

    // Upsert product
    let productId = id
    if (id) {
      // Update
      const { error } = await supabase
        .from('products')
        .update({
          sku_code,
          title,
          message_type: message_type || 'fixed',
          total_days: total_days || null,
          description: description || null,
          is_active: is_active ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // Insert
      const { data, error } = await supabase
        .from('products')
        .insert({
          sku_code,
          title,
          message_type: message_type || 'fixed',
          total_days: total_days || null,
          description: description || null,
          is_active: is_active ?? true,
        })
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: `SKU "${sku_code}"가 이미 존재합니다` }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      productId = data.id
    }

    // Update prices
    if (prices && Array.isArray(prices)) {
      // 기존 가격 삭제 후 재생성
      await supabase.from('product_prices').delete().eq('product_id', productId)

      if (prices.length > 0) {
        const priceRows = prices.map((p: any) => ({
          product_id: productId,
          duration_days: p.duration_days,
          price: p.price,
        }))

        const { error: priceError } = await supabase
          .from('product_prices')
          .insert(priceRows)

        if (priceError) return NextResponse.json({ error: priceError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, id: productId })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
