import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { appendSheetData, ensureSheetTab } from '@/lib/google-sheets'

export const maxDuration = 60

type Action = 'retry_now' | 'retry_next' | 'retry_shift' | 'skip'

interface RequestBody {
  deviceId: string
  sendDate: string
  action: Action
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body: RequestBody = await req.json()
    const { deviceId, sendDate, action } = body

    if (!deviceId || !sendDate || !action) {
      return NextResponse.json({ error: 'deviceId, sendDate, action은 필수입니다' }, { status: 400 })
    }

    const validActions: Action[] = ['retry_now', 'retry_next', 'retry_shift', 'skip']
    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `유효하지 않은 action: ${action}` }, { status: 400 })
    }

    // 해당 디바이스 + 날짜의 실패 큐 조회
    const { data: failedQueues, error: queueErr } = await supabase
      .from('send_queues')
      .select('id, subscription_id, day_number, kakao_friend_name, message_content, image_path, device_id')
      .eq('device_id', deviceId)
      .eq('send_date', sendDate)
      .eq('status', 'failed')

    if (queueErr) throw new Error(`실패 큐 조회 오류: ${queueErr.message}`)
    if (!failedQueues?.length) {
      return NextResponse.json({ ok: true, count: 0, message: '처리할 실패 건이 없습니다' })
    }

    const now = new Date().toISOString()

    switch (action) {
      case 'retry_now':
        return await handleRetryNow(failedQueues, deviceId, now)
      case 'retry_next':
        return await handleRetryNext(failedQueues, now)
      case 'retry_shift':
        return await handleRetryShift(failedQueues, now)
      case 'skip':
        return await handleSkip(failedQueues, now)
      default:
        return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '실패 처리 중 오류가 발생했습니다' }, { status: 500 })
  }
}

// ─── retry_now: 지금 다시 보내기 ─────────────────────────────

async function handleRetryNow(
  failedQueues: any[],
  deviceId: string,
  now: string
) {
  // 디바이스 전화번호 조회
  const { data: device, error: devErr } = await supabase
    .from('send_devices')
    .select('phone_number')
    .eq('id', deviceId)
    .single()

  if (devErr || !device) throw new Error('디바이스 정보 조회 실패')

  // failure_retry_now 알림 템플릿 조회
  const { data: noticeTemplate } = await supabase
    .from('notice_templates')
    .select('content')
    .eq('notice_type', 'failure_retry_now')
    .limit(1)
    .maybeSingle()

  const noticeContent = noticeTemplate?.content || ''

  // 실패 큐 → pending으로 리셋
  const queueIds = failedQueues.map(q => q.id)
  const { error: updateErr } = await supabase
    .from('send_queues')
    .update({ status: 'pending', error_message: null, sent_at: null, updated_at: now })
    .in('id', queueIds)

  if (updateErr) throw new Error(`큐 상태 리셋 실패: ${updateErr.message}`)

  // Google Sheet에 append (디바이스 전화번호 탭)
  await ensureSheetTab(device.phone_number)

  const sheetRows: string[][] = []
  for (const q of failedQueues) {
    // Row 1: 알림 메시지 (queue_id 비워서 import 시 skip)
    if (noticeContent) {
      sheetRows.push([
        q.kakao_friend_name || '',
        noticeContent,
        '',  // 파일 없음
        '',  // 예약시간 없음
        '',  // 처리결과
        '',  // 처리일시
        '',  // queue_id 비움 — import 시 무시됨
      ])
    }

    // Row 2: 원래 메시지 (텍스트 + 이미지, 예약시간 없음)
    sheetRows.push([
      q.kakao_friend_name || '',
      q.message_content || '',
      q.image_path || '',
      '',  // 예약시간 없음
      '',  // 처리결과
      '',  // 처리일시
      q.id,
    ])
  }

  // 시트 쓰기 실패 시 DB 롤백
  try {
    if (sheetRows.length > 0) {
      await appendSheetData(device.phone_number, sheetRows)
    }
  } catch (sheetErr: any) {
    // DB를 failed로 되돌림
    await supabase
      .from('send_queues')
      .update({ status: 'failed', updated_at: now })
      .in('id', queueIds)
    throw new Error(`구글시트 추가 실패: ${sheetErr.message}`)
  }

  return NextResponse.json({ ok: true, action: 'retry_now', count: failedQueues.length })
}

// ─── retry_next: 다음 발송 시 함께 보내기 ────────────────────

async function handleRetryNext(failedQueues: any[], now: string) {
  const queueIds = failedQueues.map(q => q.id)

  // 실패 큐 → pending으로 리셋
  const { error: updateErr } = await supabase
    .from('send_queues')
    .update({ status: 'pending', error_message: null, sent_at: null, updated_at: now })
    .in('id', queueIds)

  if (updateErr) throw new Error(`큐 상태 리셋 실패: ${updateErr.message}`)

  // 구독의 failure_type, failure_date 클리어
  const subIds = [...new Set(failedQueues.map(q => q.subscription_id).filter(Boolean))]
  if (subIds.length > 0) {
    const { error: subErr } = await supabase
      .from('subscriptions')
      .update({ failure_type: null, failure_date: null, updated_at: now })
      .in('id', subIds)

    if (subErr) throw new Error(`구독 상태 클리어 실패: ${subErr.message}`)
  }

  return NextResponse.json({ ok: true, action: 'retry_next', count: failedQueues.length })
}

// ─── retry_shift: 밀어서 보내기 ──────────────────────────────

async function handleRetryShift(failedQueues: any[], now: string) {
  const queueIds = failedQueues.map(q => q.id)

  // 실패 큐 → pending으로 리셋
  const { error: updateErr } = await supabase
    .from('send_queues')
    .update({ status: 'pending', error_message: null, sent_at: null, updated_at: now })
    .in('id', queueIds)

  if (updateErr) throw new Error(`큐 상태 리셋 실패: ${updateErr.message}`)

  // 영향받는 구독 ID 수집
  const subIds = [...new Set(failedQueues.map(q => q.subscription_id).filter(Boolean))]
  if (subIds.length > 0) {
    // failure_type, failure_date 클리어
    const { error: subErr } = await supabase
      .from('subscriptions')
      .update({ failure_type: null, failure_date: null, updated_at: now })
      .in('id', subIds)

    if (subErr) throw new Error(`구독 상태 클리어 실패: ${subErr.message}`)

    // 각 구독의 duration_days를 원자적으로 1 증가
    for (const subId of subIds) {
      const { error: durErr } = await supabase.rpc('increment_duration_days', { sub_id: subId })
      if (durErr) throw new Error(`구독 기간 연장 실패 (${subId}): ${durErr.message}`)
    }
  }

  return NextResponse.json({ ok: true, action: 'retry_shift', count: failedQueues.length })
}

// ─── skip: 무시하기 ──────────────────────────────────────────

async function handleSkip(failedQueues: any[], now: string) {
  const queueIds = failedQueues.map(q => q.id)

  // 실패 큐 → sent + error_message로 스킵 표시
  const { error: updateErr } = await supabase
    .from('send_queues')
    .update({ status: 'sent', error_message: '관리자 스킵', sent_at: now, updated_at: now })
    .in('id', queueIds)

  if (updateErr) throw new Error(`큐 스킵 처리 실패: ${updateErr.message}`)

  // 구독별로 last_sent_day 업데이트
  const subDayMap = new Map<string, number[]>()
  for (const q of failedQueues) {
    if (!q.subscription_id || !q.day_number) continue
    const days = subDayMap.get(q.subscription_id) || []
    days.push(q.day_number)
    subDayMap.set(q.subscription_id, days)
  }

  for (const [subId, days] of subDayMap) {
    const maxDay = Math.max(...days)

    // 현재 last_sent_day 조회 후 더 큰 값으로만 업데이트
    const { data: sub, error: fetchErr } = await supabase
      .from('subscriptions')
      .select('last_sent_day')
      .eq('id', subId)
      .single()

    if (fetchErr) throw new Error(`구독 조회 실패 (${subId}): ${fetchErr.message}`)
    if (!sub) continue

    const currentLastSent = sub.last_sent_day ?? 0

    // 스킵한 day가 last_sent_day + 1부터 연속일 때만 업데이트
    // (중간에 빠진 day가 없어야 함)
    const sortedDays = days.sort((a, b) => a - b)
    let newLastSent = currentLastSent
    for (const d of sortedDays) {
      if (d === newLastSent + 1) {
        newLastSent = d
      }
    }

    if (newLastSent > currentLastSent) {
      const { error: subErr } = await supabase
        .from('subscriptions')
        .update({
          last_sent_day: newLastSent,
          failure_type: null,
          failure_date: null,
          updated_at: now,
        })
        .eq('id', subId)

      if (subErr) throw new Error(`구독 last_sent_day 업데이트 실패 (${subId}): ${subErr.message}`)
    } else {
      // day가 연속이 아니더라도 failure 상태는 클리어
      const { error: clearErr } = await supabase
        .from('subscriptions')
        .update({ failure_type: null, failure_date: null, updated_at: now })
        .eq('id', subId)
      if (clearErr) throw new Error(`구독 failure 상태 클리어 실패 (${subId}): ${clearErr.message}`)
    }
  }

  return NextResponse.json({ ok: true, action: 'skip', count: failedQueues.length })
}
