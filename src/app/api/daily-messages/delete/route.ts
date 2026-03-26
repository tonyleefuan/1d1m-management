import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, product_id, send_date } = body

    if (!id && (!product_id || !send_date)) {
      return NextResponse.json({ error: 'id 또는 product_id+send_date가 필요합니다' }, { status: 400 })
    }

    // 승인된 메시지는 삭제 불가
    if (id) {
      const { data: msg } = await supabase.from('daily_messages').select('status').eq('id', id).single()
      if (msg?.status === 'approved') {
        return NextResponse.json({ error: '승인된 메시지는 삭제할 수 없습니다' }, { status: 409 })
      }
    }

    let query = supabase.from('daily_messages').delete()

    if (id) {
      query = query.eq('id', id)
    } else {
      query = query.eq('product_id', product_id).eq('send_date', send_date).neq('status', 'approved')
    }

    const { error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '서버 오류' }, { status: 500 })
  }
}
