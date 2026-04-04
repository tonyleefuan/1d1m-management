import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createCsSession, clearCsSession } from '@/lib/cs-auth'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  try {
    const { orderNo, phoneLast4 } = await req.json()
    if (!orderNo || !phoneLast4) {
      return NextResponse.json({ error: '주문번호와 전화번호 뒷 4자리를 모두 입력해 주세요.' }, { status: 400 })
    }

    const trimmedOrderNo = orderNo.trim()

    // ── 1. IP 기반 Rate Limit (15분 5회) ──
    const ip = headers().get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('cs_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('identifier', ip)
      .eq('action', 'auth')
      .gte('attempted_at', fifteenMinAgo)

    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: '잠시 후 다시 시도해 주세요. 인증 시도 횟수가 초과되었습니다.' }, { status: 429 })
    }

    // ── 2. 주문번호별 지수 백오프 잠금 ──
    const { data: lockout } = await supabase
      .from('cs_auth_lockouts')
      .select('id, fail_count, locked_until')
      .eq('order_no', trimmedOrderNo)
      .single()

    if (lockout?.locked_until && new Date(lockout.locked_until) > new Date()) {
      const remainMin = Math.ceil((new Date(lockout.locked_until).getTime() - Date.now()) / 60000)
      return NextResponse.json({
        error: `인증 시도 횟수가 초과되었습니다. ${remainMin}분 후에 다시 시도해 주세요.`,
      }, { status: 429 })
    }

    // Log IP attempt
    await supabase.from('cs_rate_limits').insert({ identifier: ip, action: 'auth' })

    // Lookup order → customer
    const { data: order } = await supabase
      .from('orders')
      .select('id, customer_id')
      .eq('imweb_order_no', trimmedOrderNo)
      .single()

    if (!order?.customer_id) {
      await recordAuthFailure(trimmedOrderNo, lockout)
      return NextResponse.json({ error: '주문 정보가 일치하지 않습니다. 주문번호와 전화번호를 다시 확인해 주세요.' }, { status: 401 })
    }

    // Verify phone_last4
    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, phone_last4, kakao_friend_name')
      .eq('id', order.customer_id)
      .single()

    if (!customer || customer.phone_last4 !== phoneLast4.trim()) {
      await recordAuthFailure(trimmedOrderNo, lockout)
      return NextResponse.json({ error: '주문 정보가 일치하지 않습니다. 주문번호와 전화번호를 다시 확인해 주세요.' }, { status: 401 })
    }

    // 인증 성공 — 잠금 해제
    if (lockout) {
      await supabase
        .from('cs_auth_lockouts')
        .delete()
        .eq('order_no', trimmedOrderNo)
    }

    // Create CS session
    const customerName = customer.name || customer.kakao_friend_name || '고객'
    await createCsSession({
      customerId: customer.id,
      customerName,
    })

    return NextResponse.json({
      ok: true,
      customerName,
      customerId: customer.id,
    })
  } catch {
    return NextResponse.json({ error: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }
}

// 인증 실패 기록 + 지수 백오프 잠금
// 3회 실패: 10분, 5회: 30분, 7회 이상: 1시간
async function recordAuthFailure(
  orderNo: string,
  existing: { id: string; fail_count: number } | null
) {
  const newCount = (existing?.fail_count ?? 0) + 1
  let lockedUntil: string | null = null

  if (newCount >= 7) {
    lockedUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1시간
  } else if (newCount >= 5) {
    lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30분
  } else if (newCount >= 3) {
    lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10분
  }

  if (existing) {
    await supabase
      .from('cs_auth_lockouts')
      .update({
        fail_count: newCount,
        locked_until: lockedUntil,
        last_attempt_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('cs_auth_lockouts')
      .insert({
        order_no: orderNo,
        fail_count: newCount,
        locked_until: lockedUntil,
      })
  }
}

export async function DELETE() {
  await clearCsSession()
  return NextResponse.json({ ok: true })
}
