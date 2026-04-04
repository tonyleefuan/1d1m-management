import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase'

// 비인증 기타 문의 접수
export async function POST(req: Request) {
  try {
    const { email, content } = await req.json()

    // 이메일 검증
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: '올바른 이메일 주소를 입력해 주세요.' }, { status: 400 })
    }
    if (!content?.trim()) {
      return NextResponse.json({ error: '문의 내용을 입력해 주세요.' }, { status: 400 })
    }
    if (content.trim().length > 2000) {
      return NextResponse.json({ error: '문의 내용은 2,000자 이내로 작성해 주세요.' }, { status: 400 })
    }

    // IP 기반 rate limit: 1시간에 5건
    const h = await headers()
    const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { count } = await supabase
      .from('cs_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', ip)
      .eq('action', 'general_inquiry')
      .gte('attempted_at', oneHourAgo)

    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: '짧은 시간 내 너무 많은 문의를 등록하셨습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 })
    }

    // rate limit 기록
    await supabase.from('cs_rate_limits').insert({
      identifier: ip,
      action: 'general_inquiry',
    })

    // 문의 저장
    const { error } = await supabase
      .from('cs_general_inquiries')
      .insert({
        email: email.trim(),
        content: content.trim(),
      })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: '문의 접수에 실패했습니다.' }, { status: 500 })
  }
}
