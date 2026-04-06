export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

// PATCH: 환불 요청 상태 변경 (approve / complete / reject)
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { action, admin_note, reject_reason } = body

  // 현재 요청 조회
  const { data: refund, error: fetchErr } = await supabase
    .from('cs_refund_requests')
    .select('id, status, subscription_id, inquiry_id')
    .eq('id', params.id)
    .single()

  if (fetchErr || !refund) {
    return NextResponse.json({ error: '환불 요청을 찾을 수 없습니다.' }, { status: 404 })
  }

  const now = new Date().toISOString()

  if (action === 'approve') {
    if (refund.status !== 'pending') {
      return NextResponse.json({ error: `현재 상태(${refund.status})에서는 승인할 수 없습니다.` }, { status: 400 })
    }

    const { error } = await supabase
      .from('cs_refund_requests')
      .update({
        status: 'approved',
        admin_note: admin_note || null,
        processed_by: session.userId,
        processed_at: now,
        updated_at: now,
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'complete') {
    if (refund.status !== 'pending' && refund.status !== 'approved') {
      return NextResponse.json({ error: `현재 상태(${refund.status})에서는 완료 처리할 수 없습니다.` }, { status: 400 })
    }

    // 환불 요청 완료 처리
    const { error: refundErr } = await supabase
      .from('cs_refund_requests')
      .update({
        status: 'completed',
        admin_note: admin_note || null,
        processed_by: session.userId,
        processed_at: now,
        updated_at: now,
      })
      .eq('id', params.id)

    if (refundErr) return NextResponse.json({ error: refundErr.message }, { status: 500 })

    // 구독 취소 처리
    const today = new Date().toISOString().split('T')[0]
    await supabase
      .from('subscriptions')
      .update({
        status: 'cancel',
        is_cancelled: true,
        cancelled_at: today,
        cancel_reason: '고객 환불 요청',
      })
      .eq('id', refund.subscription_id)

    // 고객에게 환불 완료 안내 댓글
    if (refund.inquiry_id) {
      await supabase.from('cs_replies').insert({
        inquiry_id: refund.inquiry_id,
        author_type: 'system',
        author_name: null,
        content: '환불이 정상 처리되었습니다. 이용해 주셔서 감사합니다.',
      })

      // 문의 상태 종료
      await supabase
        .from('cs_inquiries')
        .update({ status: 'closed' })
        .eq('id', refund.inquiry_id)
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'reject') {
    if (refund.status !== 'pending') {
      return NextResponse.json({ error: `현재 상태(${refund.status})에서는 거절할 수 없습니다.` }, { status: 400 })
    }

    if (!reject_reason?.trim()) {
      return NextResponse.json({ error: '거절 사유를 입력해 주세요.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('cs_refund_requests')
      .update({
        status: 'rejected',
        reject_reason: reject_reason.trim(),
        admin_note: admin_note || null,
        processed_by: session.userId,
        processed_at: now,
        updated_at: now,
      })
      .eq('id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 고객에게 거절 안내 댓글 + 문의 상태를 admin_answered로 변경 (stuck 방지)
    if (refund.inquiry_id) {
      await supabase.from('cs_replies').insert({
        inquiry_id: refund.inquiry_id,
        author_type: 'admin',
        author_name: null,
        content: `환불 요청이 반려되었습니다. 사유: ${reject_reason.trim()}`,
      })
      await supabase
        .from('cs_inquiries')
        .update({ status: 'admin_answered' })
        .eq('id', refund.inquiry_id)
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '올바르지 않은 액션입니다. (approve / complete / reject)' }, { status: 400 })
}
