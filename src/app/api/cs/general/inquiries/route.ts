import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getGeneralSession, hashPin } from '@/lib/cs-general-auth'

export async function GET() {
  const session = await getGeneralSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('cs_general_inquiries')
    .select('id, content, status, created_at, updated_at, cs_general_replies(id)')
    .eq('email', session.email)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = data?.map(inq => ({
    ...inq,
    reply_count: inq.cs_general_replies?.length ?? 0,
    cs_general_replies: undefined,
  }))

  return NextResponse.json({ data: enriched || [] })
}

export async function POST(req: Request) {
  const session = await getGeneralSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { content, pin } = await req.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: '문의 내용을 입력해 주세요.' }, { status: 400 })
    }
    if (content.trim().length > 2000) {
      return NextResponse.json({ error: '문의 내용은 2,000자 이내로 작성해 주세요.' }, { status: 400 })
    }

    // 이 이메일로 첫 문의인지 확인
    const { data: existing } = await supabase
      .from('cs_general_inquiries')
      .select('id')
      .eq('email', session.email)
      .limit(1)
      .single()

    let passwordHash: string
    if (existing) {
      // 기존 사용자 — 기존 해시 사용
      const { data: row } = await supabase
        .from('cs_general_inquiries')
        .select('password_hash')
        .eq('email', session.email)
        .limit(1)
        .single()
      passwordHash = row!.password_hash
    } else {
      // 첫 문의 — pin 필수
      if (!pin?.trim() || !/^\d{4}$/.test(pin.trim())) {
        return NextResponse.json({ error: '비밀번호 4자리를 입력해 주세요.' }, { status: 400 })
      }
      passwordHash = hashPin(pin.trim(), session.email)
    }

    const { data, error } = await supabase
      .from('cs_general_inquiries')
      .insert({
        email: session.email,
        password_hash: passwordHash,
        content: content.trim(),
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: '문의 접수에 실패했습니다.' }, { status: 500 })
  }
}
