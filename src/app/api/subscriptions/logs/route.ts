import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const subscriptionId = searchParams.get('subscription_id')

  if (!subscriptionId) {
    return NextResponse.json({ error: 'subscription_id 필수' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('subscription_logs')
    .select('*, user:users(name)')
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
