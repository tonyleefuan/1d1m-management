export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

const SEND_KEYS = ['send_start_time', 'send_message_delay', 'send_file_delay'] as const

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [...SEND_KEYS])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: Record<string, unknown> = {
    send_start_time: '04:00',
    send_message_delay: 3,
    send_file_delay: 6,
  }
  data?.forEach(row => {
    const val = row.value
    settings[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : val
  })

  return NextResponse.json(settings)
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()

    for (const key of SEND_KEYS) {
      if (body[key] !== undefined) {
        const value = typeof body[key] === 'string' ? `"${body[key]}"` : body[key]
        await supabase
          .from('app_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '발송 설정 저장 중 오류가 발생했습니다' }, { status: 500 })
  }
}
