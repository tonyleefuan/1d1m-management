export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { modifyMessage } from '@/lib/ai/claude'
import { shortenUrlsInText } from '@/lib/ai/url-shortener'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { message_id, instruction } = await request.json()
  if (!message_id || !instruction) {
    return NextResponse.json({ error: 'message_id, instruction 필요' }, { status: 400 })
  }

  const { data: msg } = await supabase
    .from('daily_messages')
    .select('content, product_id')
    .eq('id', message_id)
    .single()

  if (!msg) return NextResponse.json({ error: '메시지 없음' }, { status: 404 })

  const { data: prompt } = await supabase
    .from('product_prompts')
    .select('generation_prompt')
    .eq('product_id', msg.product_id)
    .single()

  let modified = await modifyMessage(msg.content, instruction, prompt?.generation_prompt || '')
  modified = await shortenUrlsInText(modified)

  await supabase
    .from('daily_messages')
    .update({ content: modified, status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', message_id)

  return NextResponse.json({ ok: true, content: modified })
}
