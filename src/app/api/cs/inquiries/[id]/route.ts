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
    return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (inquiry.customer_id !== session.customerId) {
    return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
  }

  if (inquiry.cs_replies) {
    inquiry.cs_replies.sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  return NextResponse.json({ data: inquiry })
}
