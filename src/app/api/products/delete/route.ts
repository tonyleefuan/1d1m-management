export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: '상품 ID가 필요합니다.' }, { status: 400 })

  // 연결된 구독이 있는지 확인
  const { count } = await supabase
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', id)

  if (count && count > 0) {
    return NextResponse.json({
      error: `이 상품에 연결된 구독이 ${count}건 있어 삭제할 수 없습니다. 비활성화를 사용해 주세요.`,
    }, { status: 409 })
  }

  // 가격 먼저 삭제
  await supabase.from('product_prices').delete().eq('product_id', id)

  // 상품 삭제
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
