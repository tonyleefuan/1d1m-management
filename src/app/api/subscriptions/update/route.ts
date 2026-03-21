import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { id, ids, ...updates } = body

    // 단건 또는 벌크 업데이트
    const targetIds = ids || (id ? [id] : [])
    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'ID가 필요합니다' }, { status: 400 })
    }

    const updateData: any = { updated_at: new Date().toISOString() }

    // 허용된 필드만
    if (updates.status !== undefined) {
      updateData.status = updates.status
      if (updates.status === 'pause') updateData.paused_at = new Date().toISOString()
      if (updates.status === 'cancel') {
        updateData.cancelled_at = new Date().toISOString()
        updateData.cancel_reason = updates.cancel_reason || null
      }
      if (updates.status === 'live' && updates.start_date === undefined) {
        // pause → live 복귀 시 paused_at 초기화
        updateData.paused_at = null
      }
    }
    if (updates.device_id !== undefined) updateData.device_id = updates.device_id
    if (updates.start_date !== undefined) {
      updateData.start_date = updates.start_date
      // end_date 자동 계산
      if (updates.start_date) {
        const startDate = new Date(updates.start_date)
        // duration_days는 각 구독마다 다를 수 있으므로 단건일 때만 계산
        if (targetIds.length === 1) {
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('duration_days')
            .eq('id', targetIds[0])
            .single()
          if (sub) {
            const endDate = new Date(startDate)
            endDate.setDate(endDate.getDate() + sub.duration_days - 1)
            updateData.end_date = endDate.toISOString().slice(0, 10)
          }
        }
      }
    }
    if (updates.friend_confirmed !== undefined) {
      updateData.friend_confirmed = updates.friend_confirmed
      if (updates.friend_confirmed) {
        updateData.friend_confirmed_at = new Date().toISOString()
        // 전화번호 7일 후 삭제 예약
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        // customer의 phone_expires_at 업데이트는 별도 처리
      } else {
        updateData.friend_confirmed_at = null
      }
    }
    if (updates.memo !== undefined) updateData.memo = updates.memo

    const { error } = await supabase
      .from('subscriptions')
      .update(updateData)
      .in('id', targetIds)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // 친구확인 시 customer의 phone_expires_at 업데이트
    if (updates.friend_confirmed === true && targetIds.length === 1) {
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('customer_id')
        .eq('id', targetIds[0])
        .single()
      if (sub) {
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)
        await supabase
          .from('customers')
          .update({ phone_expires_at: expiresAt.toISOString() })
          .eq('id', sub.customer_id)
      }
    }

    return NextResponse.json({ ok: true, updated: targetIds.length })
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
