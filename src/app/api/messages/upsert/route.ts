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
    const { id, product_id, day_number, content, image_path } = body

    if (!product_id || !day_number || !content) {
      return NextResponse.json({ error: '상품, Day, 내용은 필수입니다' }, { status: 400 })
    }

    if (id) {
      const { error } = await supabase
        .from('messages')
        .update({ content, image_path: image_path || null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('product_id', product_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // 같은 Day의 다음 sort_order 자동 계산
      const { data: existing } = await supabase
        .from('messages')
        .select('sort_order')
        .eq('product_id', product_id)
        .eq('day_number', day_number)
        .order('sort_order', { ascending: false })
        .limit(1)
      const sort_order = body.sort_order ?? ((existing?.[0]?.sort_order ?? 0) + 1)
      const { error } = await supabase
        .from('messages')
        .upsert({ product_id, day_number, content, image_path: image_path || null, sort_order }, { onConflict: 'product_id,day_number,sort_order' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
