export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { appendSheetData, ensureSheetTab } from '@/lib/google-sheets'

export const maxDuration = 60

type Action = 'retry_now'

interface RequestBody {
  deviceId: string
  sendDate: string
  action: Action
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body: RequestBody = await req.json()
    const { deviceId, sendDate, action } = body

    if (!deviceId || !sendDate || !action) {
      return NextResponse.json({ error: 'deviceId, sendDate, action은 필수입니다' }, { status: 400 })
    }

    const validActions: Action[] = ['retry_now']
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

    return await handleRetryNow(failedQueues, deviceId, now)
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
