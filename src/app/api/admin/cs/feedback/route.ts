export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

/**
 * POST /api/admin/cs/feedback
 * AI 답변 품질 피드백 등록
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { inquiry_id, reply_id, rating, note } = await req.json()

  if (!inquiry_id || !reply_id) {
    return NextResponse.json({ error: '문의 ID와 답변 ID가 필요합니다.' }, { status: 400 })
  }

  if (!rating || !['good', 'bad'].includes(rating)) {
    return NextResponse.json({ error: '평가는 good 또는 bad만 가능합니다.' }, { status: 400 })
  }

  // 중복 체크: 같은 reply에 대해 이미 피드백이 있으면 업데이트
  const { data: existing } = await supabase
    .from('cs_ai_feedback')
    .select('id')
    .eq('reply_id', reply_id)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('cs_ai_feedback')
      .update({
        rating,
        note: note?.trim() || null,
        rated_by: session.userId,
      })
      .eq('id', existing.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, updated: true })
  }

  const { error } = await supabase
    .from('cs_ai_feedback')
    .insert({
      inquiry_id,
      reply_id,
      rating,
      note: note?.trim() || null,
      rated_by: session.userId,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
