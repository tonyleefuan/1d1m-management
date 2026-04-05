import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { ensureSheetTab, writeSheetData } from '@/lib/google-sheets'

const HEADER = ['이름/채팅방명', '텍스트', '파일', '예약시간', '처리결과', '처리일시', 'queue_id']

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data: devices } = await supabase
      .from('send_devices')
      .select('phone_number')
      .eq('is_active', true)

    if (!devices?.length) {
      return NextResponse.json({ error: '활성 디바이스가 없습니다' }, { status: 400 })
    }

    let cleared = 0
    for (const dev of devices) {
      try {
        await ensureSheetTab(dev.phone_number)
        await writeSheetData(dev.phone_number, [HEADER])
        cleared++
      } catch { /* 실패한 탭 무시 */ }
    }

    return NextResponse.json({ ok: true, cleared, message: `${cleared}개 PC 시트 초기화 완료` })
  } catch (err: any) {
    console.error('[clear-sheet] Error:', err.message)
    return NextResponse.json({ error: err.message || '시트 초기화 실패' }, { status: 500 })
  }
}
