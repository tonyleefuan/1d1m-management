export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { hashPin, createGeneralSession, clearGeneralSession } from '@/lib/cs-general-auth'

export async function POST(req: Request) {
  try {
    const { email, pin } = await req.json()

    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: '올바른 이메일 주소를 입력해 주세요.' }, { status: 400 })
    }
    if (!pin?.trim() || !/^\d{4}$/.test(pin.trim())) {
      return NextResponse.json({ error: '비밀번호 4자리를 입력해 주세요.' }, { status: 400 })
    }

    // IP rate limit: 15분에 10회
    const h = await headers()
    const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    const { count } = await supabase
      .from('cs_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', ip)
      .eq('action', 'general_auth')
      .gte('attempted_at', fifteenMinAgo)

    if ((count ?? 0) >= 10) {
      return NextResponse.json({ error: '잠시 후 다시 시도해 주세요.' }, { status: 429 })
    }

    await supabase.from('cs_rate_limits').insert({ identifier: ip, action: 'general_auth' })

    const normalEmail = email.trim().toLowerCase()
    const hash = hashPin(pin.trim(), normalEmail)

    // 해당 이메일로 문의가 있는지 확인
    const { data: existing } = await supabase
      .from('cs_general_inquiries')
      .select('password_hash')
      .eq('email', normalEmail)
      .limit(1)
      .single()

    if (existing) {
      // 비밀번호 검증
      if (existing.password_hash !== hash) {
        return NextResponse.json({ error: '이메일 또는 비밀번호가 일치하지 않습니다.' }, { status: 401 })
      }
    }
    // 문의가 없으면 새 사용자 — 세션만 생성하고 대시보드에서 첫 문의 시 등록됨

    await createGeneralSession({ email: normalEmail })
    return NextResponse.json({ success: true, isNew: !existing })
  } catch {
    return NextResponse.json({ error: '일시적인 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE() {
  await clearGeneralSession()
  return NextResponse.json({ success: true })
}
