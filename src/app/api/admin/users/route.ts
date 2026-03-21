import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession, hashPassword } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('users')
    .select('id, username, name, role, is_active, created_at')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { id, username, password, name, role, is_active } = body

    if (!username || !name) {
      return NextResponse.json({ error: '아이디와 이름은 필수입니다' }, { status: 400 })
    }

    const VALID_ROLES = ['admin', 'staff'] as const
    if (role && !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: '유효하지 않은 역할입니다' }, { status: 400 })
    }

    if (id) {
      // Update
      const updateData: any = { name, role: role || 'staff', is_active: is_active ?? true, updated_at: new Date().toISOString() }
      if (password) updateData.password_hash = await hashPassword(password)
      const { error } = await supabase.from('users').update(updateData).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      // Create
      if (!password) return NextResponse.json({ error: '비밀번호는 필수입니다' }, { status: 400 })
      const password_hash = await hashPassword(password)
      const { error } = await supabase.from('users').insert({ username, password_hash, name, role: role || 'staff' })
      if (error) {
        if (error.code === '23505') return NextResponse.json({ error: `"${username}" 아이디가 이미 존재합니다` }, { status: 409 })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
