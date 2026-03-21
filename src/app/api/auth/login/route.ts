import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyPassword, createSession } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const { username, password } = await req.json()

    if (!username || !password) {
      return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요' }, { status: 400 })
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, password_hash, name, role, is_active')
      .eq('username', username)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 })
    }

    if (!user.is_active) {
      return NextResponse.json({ error: '비활성화된 계정입니다' }, { status: 403 })
    }

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 })
    }

    await createSession({
      userId: user.id,
      username: user.username,
      role: user.role,
    })

    return NextResponse.json({ ok: true, user: { name: user.name, role: user.role } })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
