import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('product_id')

  if (!productId) return NextResponse.json({ error: 'product_id 필수' }, { status: 400 })

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('product_id', productId)
    .order('day_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
