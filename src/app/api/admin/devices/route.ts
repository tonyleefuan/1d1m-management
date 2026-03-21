import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('send_devices')
    .select('*')
    .order('phone_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 각 디바이스의 활성 구독 수
  const { data: subCounts } = await supabase
    .from('subscriptions')
    .select('device_id')
    .eq('status', 'live')

  const countMap: Record<string, number> = {}
  subCounts?.forEach(s => {
    if (s.device_id) countMap[s.device_id] = (countMap[s.device_id] || 0) + 1
  })

  const enriched = data?.map(d => ({ ...d, active_subscriptions: countMap[d.id] || 0 }))
  return NextResponse.json(enriched)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { id, phone_number, name, is_active } = body

    if (!phone_number) return NextResponse.json({ error: '전화번호는 필수입니다' }, { status: 400 })

    if (id) {
      const { error } = await supabase.from('send_devices').update({ phone_number, name: name || null, is_active: is_active ?? true }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await supabase.from('send_devices').insert({ phone_number, name: name || null })
      if (error) {
        if (error.code === '23505') return NextResponse.json({ error: '이미 등록된 번호입니다' }, { status: 409 })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
