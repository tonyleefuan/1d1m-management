export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'queue_generation_progress')
    .single()

  const progress = data?.value || null

  return NextResponse.json({ progress })
}
