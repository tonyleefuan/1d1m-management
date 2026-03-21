import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('product_id')

  if (!productId) return NextResponse.json({ error: 'product_id 필수' }, { status: 400 })

  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)

  // 먼저 총 개수 조회 (내용 없이)
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)

  // 페이지네이션 적용 — 내용은 미리보기용 200자만
  const { data, error } = await supabase
    .from('messages')
    .select('id, product_id, day_number, sort_order, image_path, created_at')
    .eq('product_id', productId)
    .order('day_number')
    .range((page - 1) * limit, page * limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 미리보기용 content 별도 조회 (200자 제한)
  if (data?.length) {
    const ids = data.map(d => d.id)
    const { data: contents } = await supabase
      .from('messages')
      .select('id, content')
      .in('id', ids)

    const contentMap = new Map(contents?.map(c => [c.id, c.content]) || [])
    for (const msg of data) {
      const full = contentMap.get(msg.id) || ''
      ;(msg as any).content = full.slice(0, 200)
      ;(msg as any).content_length = full.length
    }
  }

  return NextResponse.json({ data, total: count, page, limit })
}
