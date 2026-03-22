import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data, error } = await supabase
    .from('product_prompts')
    .select('*, products(sku_code, title)')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prompts: data })
}

export async function PUT(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { product_id, search_prompt, generation_prompt, additional_prompt } = await request.json()
  if (!product_id) return NextResponse.json({ error: 'product_id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('product_prompts')
    .upsert({
      product_id,
      search_prompt: search_prompt || '',
      generation_prompt: generation_prompt || '',
      additional_prompt: additional_prompt || '',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'product_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
