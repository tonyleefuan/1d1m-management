export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { appendSheetData, ensureSheetTab } from '@/lib/google-sheets'

export const maxDuration = 60

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids } = await req.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids 배열이 필요합니다' }, { status: 400 })
  }

  try {
    // 실패 큐 조회
    const { data: failedQueues, error: queueErr } = await supabase
      .from('send_queues')
      .select('id, subscription_id, day_number, kakao_friend_name, message_content, image_path, device_id')
      .in('id', ids)
      .eq('status', 'failed')

    if (queueErr) throw new Error(`실패 큐 조회 오류: ${queueErr.message}`)
    if (!failedQueues?.length) {
      return NextResponse.json({ ok: true, updated: 0, message: '처리할 실패 건이 없습니다' })
    }

    // failure_retry_now 알림 템플릿 조회
    const { data: noticeTemplate } = await supabase
      .from('notice_templates')
      .select('content')
      .eq('notice_type', 'failure_retry_now')
      .limit(1)
      .maybeSingle()

    const noticeContent = noticeTemplate?.content || ''

    // 디바이스별로 그룹화
    const deviceGroups = new Map<string, typeof failedQueues>()
    for (const q of failedQueues) {
      const group = deviceGroups.get(q.device_id) || []
      group.push(q)
      deviceGroups.set(q.device_id, group)
    }

    // 디바이스 전화번호 조회
    const deviceIds = [...deviceGroups.keys()]
    const { data: devices, error: devErr } = await supabase
      .from('send_devices')
      .select('id, phone_number')
      .in('id', deviceIds)

    if (devErr) throw new Error(`디바이스 정보 조회 실패: ${devErr.message}`)

    const devicePhoneMap = new Map<string, string>()
    devices?.forEach(d => devicePhoneMap.set(d.id, d.phone_number))

    // 1단계: 구글시트에 먼저 추가 (실패 시 DB 변경 없음)
    for (const [deviceId, items] of deviceGroups) {
      const phoneNumber = devicePhoneMap.get(deviceId)
      if (!phoneNumber) continue

      await ensureSheetTab(phoneNumber)

      const sheetRows: string[][] = []
      for (const q of items) {
        // 알림 메시지 행
        if (noticeContent) {
          sheetRows.push([
            q.kakao_friend_name || '',
            noticeContent,
            '',
            '',
            '',
            '',
            '',  // queue_id 비움 — import 시 무시됨
          ])
        }

        // 원래 메시지 행
        sheetRows.push([
          q.kakao_friend_name || '',
          q.message_content || '',
          q.image_path || '',
          '',
          '',
          '',
          q.id,
        ])
      }

      if (sheetRows.length > 0) {
        await appendSheetData(phoneNumber, sheetRows)
      }
    }

    // 2단계: 시트 쓰기 성공 후 DB 상태 업데이트
    const now = new Date().toISOString()
    const queueIds = failedQueues.map(q => q.id)
    const { error: updateErr } = await supabase
      .from('send_queues')
      .update({ status: 'pending', error_message: null, sent_at: null, updated_at: now })
      .in('id', queueIds)

    if (updateErr) throw new Error(`큐 상태 리셋 실패: ${updateErr.message}`)

    return NextResponse.json({ ok: true, updated: failedQueues.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '다시 보내기 처리 중 오류가 발생했습니다'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
