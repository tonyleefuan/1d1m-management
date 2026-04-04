import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('cs_policies')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, content, ai_instruction } = await req.json()
  if (!id) return NextResponse.json({ error: '정책 ID가 필요합니다.' }, { status: 400 })

  const { error } = await supabase
    .from('cs_policies')
    .update({
      content,
      ai_instruction,
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST: 새 정책 추가
export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { category, title, content, ai_instruction } = await req.json()
  if (!category || !title || !content) {
    return NextResponse.json({ error: '카테고리, 제목, 내용은 필수입니다.' }, { status: 400 })
  }

  // sort_order: 마지막 +1
  const { data: last } = await supabase
    .from('cs_policies')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (last?.sort_order || 0) + 1

  const { data, error } = await supabase
    .from('cs_policies')
    .insert({
      category,
      title,
      content,
      ai_instruction: ai_instruction || null,
      sort_order: nextOrder,
      updated_by: session.userId,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}
