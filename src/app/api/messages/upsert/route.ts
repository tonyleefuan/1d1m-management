import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('messages')
        .upsert({ product_id, day_number, content, image_path: image_path || null }, { onConflict: 'product_id,day_number' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
