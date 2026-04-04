import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getGeneralSession } from '@/lib/cs-general-auth'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getGeneralSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('cs_general_inquiries')
    .select('*, cs_general_replies(*)')
    .eq('id', params.id)
    .eq('email', session.email)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '문의를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 답글 시간순 정렬
  if (data.cs_general_replies) {
    data.cs_general_replies.sort(
      (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  return NextResponse.json({ data })
}
