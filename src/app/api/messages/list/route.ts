import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { sanitizeSearch } from '@/lib/sanitize'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('product_id')

  if (!productId) return NextResponse.json({ error: 'product_id 필수' }, { status: 400 })

  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const search = searchParams.get('search') || ''

  // 검색 조건 구성
  let countQuery = supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)

  let dataQuery = supabase
    .from('messages')
    .select('id, product_id, day_number, sort_order, image_path, created_at, content')
    .eq('product_id', productId)
    .order('day_number')

  if (search) {
    const s = sanitizeSearch(search)
    if (s) {
      const dayMatch = s.match(/^d?(\d+)$/i)
      if (dayMatch) {
        // Day 번호로 검색 (예: "D15", "15")
        const dayNum = parseInt(dayMatch[1])
        countQuery = countQuery.eq('day_number', dayNum)
        dataQuery = dataQuery.eq('day_number', dayNum)
      } else {
        // 메시지 내용 검색
        const escaped = s.replace(/%/g, '\\%').replace(/_/g, '\\_')
        countQuery = countQuery.ilike('content', `%${escaped}%`)
        dataQuery = dataQuery.ilike('content', `%${escaped}%`)
      }
    }
  }

  const { count } = await countQuery
  const { data, error } = await dataQuery.range((page - 1) * limit, page * limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // content 미리보기 200자로 자르기
  const trimmed = data?.map(msg => ({
    ...msg,
    content: (msg.content || '').slice(0, 200),
    content_length: (msg.content || '').length,
  }))

  return NextResponse.json({ data: trimmed, total: count, page, limit })
}
