import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, notice_type, product_id, content, image_path } = body

    if (!notice_type || !content) {
      return NextResponse.json({ error: '알림 타입과 내용은 필수입니다' }, { status: 400 })
    }

    if (id) {
      const { error } = await supabase
        .from('notice_templates')
        .update({ content, image_path: image_path || null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('notice_type', notice_type)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase
        .from('notice_templates')
        .insert({ notice_type, product_id: product_id || null, content, image_path: image_path || null })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
