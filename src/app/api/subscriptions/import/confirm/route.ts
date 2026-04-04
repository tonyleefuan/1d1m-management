import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

const BATCH_SIZE = 500

interface ImportRow {
  customerId: string
  productId: string
  deviceId: string | null
  status: string
  startDate: string
  endDate: string
  durationDays: number
  lastSentDay: number
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { rows } = (await req.json()) as { rows: ImportRow[] }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: '임포트할 데이터가 없습니다' }, { status: 400 })
    }

    // 1. Find existing subscriptions for upsert detection
    //    Group by customer_id + product_id to detect conflicts
    const pairKeys = rows.map(r => `${r.customerId}::${r.productId}`)
    const customerIds = [...new Set(rows.map(r => r.customerId))]
    const productIds = [...new Set(rows.map(r => r.productId))]

    // Query existing subscriptions that match any customer+product pair
    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('id, customer_id, product_id')
      .in('customer_id', customerIds)
      .in('product_id', productIds)

    const existingMap = new Map<string, string>()
    existingSubs?.forEach(s => {
      existingMap.set(`${s.customer_id}::${s.product_id}`, s.id)
    })

    // 2. Split into updates and inserts
    const updates: { id: string; data: Record<string, unknown> }[] = []
    const inserts: Record<string, unknown>[] = []

    for (const row of rows) {
      const key = `${row.customerId}::${row.productId}`
      const existingId = existingMap.get(key)

      const subData = {
        customer_id: row.customerId,
        product_id: row.productId,
        device_id: row.deviceId,
        status: row.status,
        start_date: row.startDate || null,
        end_date: row.endDate || null,
        duration_days: row.durationDays,
        last_sent_day: row.lastSentDay,
        paused_days: 0,
        is_cancelled: row.status === 'cancel',
        order_item_id: null,
      }

      if (existingId) {
        updates.push({ id: existingId, data: subData })
      } else {
        inserts.push(subData)
      }
    }

    // 3. Execute updates in batches
    let updatedCount = 0
    let updateErrors = 0
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE)
      // Supabase doesn't support bulk update with different values,
      // so we run individual updates but parallelized
      const results = await Promise.allSettled(
        batch.map(({ id, data }) =>
          supabase.from('subscriptions').update(data).eq('id', id)
        )
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.error) {
          updatedCount++
        } else {
          updateErrors++
        }
      }
    }

    // 4. Execute inserts in batches
    let createdCount = 0
    let insertErrors = 0
    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
      const batch = inserts.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('subscriptions').insert(batch)
      if (error) {
        // Fallback: one-by-one to identify problematic rows
        for (const row of batch) {
          const { error: singleError } = await supabase
            .from('subscriptions')
            .insert(row)
          if (singleError) {
            insertErrors++
          } else {
            createdCount++
          }
        }
      } else {
        createdCount += batch.length
      }
    }

    return NextResponse.json({
      ok: true,
      created: createdCount,
      updated: updatedCount,
      errors: updateErrors + insertErrors,
      total: rows.length,
    })
  } catch (err) {
    console.error('[subscriptions/import/confirm] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '임포트 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
