export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { SYSTEM_SETTING_KEYS, SYSTEM_SETTINGS } from '@/lib/constants'

// 기존 앱 설정 키 + 운영 설정 키 모두 허용
const VALID_KEYS = ['tab_order', 'default_device_id', ...SYSTEM_SETTING_KEYS]

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', VALID_KEYS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const settings: Record<string, unknown> = {}
  data?.forEach(row => { settings[row.key] = row.value })
  return NextResponse.json(settings)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { key, value } = body

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key와 value는 필수입니다' }, { status: 400 })
    }

    if (!VALID_KEYS.includes(key)) {
      return NextResponse.json({ error: '유효하지 않은 설정 키입니다' }, { status: 400 })
    }

    // 운영 설정은 범위 검증
    const def = SYSTEM_SETTINGS.find(s => s.key === key)
    if (def && def.type === 'number') {
      const numVal = Number(value)
      if (isNaN(numVal)) return NextResponse.json({ error: '숫자 값이어야 합니다' }, { status: 400 })
      if (def.min !== undefined && numVal < def.min) return NextResponse.json({ error: `최소값: ${def.min}` }, { status: 400 })
      if (def.max !== undefined && numVal > def.max) return NextResponse.json({ error: `최대값: ${def.max}` }, { status: 400 })
    }

    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

/** 일괄 저장 */
export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json() as Record<string, unknown>
    const now = new Date().toISOString()
    const rows: { key: string; value: unknown; updated_at: string }[] = []

    for (const [key, value] of Object.entries(body)) {
      if (!VALID_KEYS.includes(key)) continue

      // 범위 검증
      const def = SYSTEM_SETTINGS.find(s => s.key === key)
      if (def && def.type === 'number') {
        const numVal = Number(value)
        if (isNaN(numVal)) return NextResponse.json({ error: `${def.label}: 숫자 값이어야 합니다` }, { status: 400 })
        if (def.min !== undefined && numVal < def.min) return NextResponse.json({ error: `${def.label}: 최소값 ${def.min}` }, { status: 400 })
        if (def.max !== undefined && numVal > def.max) return NextResponse.json({ error: `${def.label}: 최대값 ${def.max}` }, { status: 400 })
      }

      rows.push({ key, value, updated_at: now })
    }

    if (rows.length === 0) return NextResponse.json({ error: '변경할 설정이 없습니다' }, { status: 400 })

    const { error } = await supabase
      .from('app_settings')
      .upsert(rows)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: rows.length })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
