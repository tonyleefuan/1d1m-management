export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCsSession } from '@/lib/cs-auth'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: inquiry, error } = await supabase
    .from('cs_inquiries')
    .select('*, cs_replies(*)')
    .eq('id', params.id)
    .single()

  if (error || !inquiry) {
    return NextResponse.json({ error: '해당 문의를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (inquiry.customer_id !== session.customerId) {
    return NextResponse.json({ error: '해당 문의를 찾을 수 없습니다.' }, { status: 403 })
  }

  if (inquiry.cs_replies) {
    inquiry.cs_replies.sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  return NextResponse.json({ data: inquiry })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getCsSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 본인 문의인지 확인
  const { data: inquiry } = await supabase
    .from('cs_inquiries')
    .select('id, customer_id, status')
    .eq('id', params.id)
    .single()

  if (!inquiry) {
    return NextResponse.json({ error: '해당 문의를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (inquiry.customer_id !== session.customerId) {
    return NextResponse.json({ error: '해당 문의를 찾을 수 없습니다.' }, { status: 403 })
  }

  // 처리 중인 환불 요청이 있으면 삭제 불가
  const { count: activeRefunds } = await supabase
    .from('cs_refund_requests')
    .select('id', { count: 'exact', head: true })
    .eq('inquiry_id', params.id)
    .in('status', ['pending', 'approved'])

  if (activeRefunds && activeRefunds > 0) {
    return NextResponse.json({ error: '처리 중인 환불 요청이 있어 삭제할 수 없습니다.' }, { status: 400 })
  }

  // 관련 데이터 삭제 후 문의 삭제 (답글 + 완료된 환불 요청)
  await supabase.from('cs_refund_requests').delete().eq('inquiry_id', params.id)
  await supabase.from('cs_replies').delete().eq('inquiry_id', params.id)
  const { error } = await supabase.from('cs_inquiries').delete().eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: '삭제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
