import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, product_id, send_date, content, image_path } = body

    if (!product_id || !send_date || !content) {
      return NextResponse.json({ error: '상품, 날짜, 내용은 필수입니다' }, { status: 400 })
    }

    if (id) {
      const { error } = await supabase
        .from('daily_messages')
        .update({ content, image_path: image_path || null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('product_id', product_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('daily_messages')
        .upsert({
          product_id, send_date, content, image_path: image_path || null,
          created_by: session.userId,
        }, { onConflict: 'product_id,send_date' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
