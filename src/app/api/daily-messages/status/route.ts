export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, status } = await request.json()
  if (!id || !['draft', 'approved'].includes(status)) {
    return NextResponse.json({ error: 'id, status(draft|approved) 필요' }, { status: 400 })
  }

  const { error } = await supabase
    .from('daily_messages')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
