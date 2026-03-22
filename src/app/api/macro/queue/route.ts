import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateQueueForDevice } from '@/lib/queue-generator'
import { todayKST } from '@/lib/day'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('device_id')
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  const result = await generateQueueForDevice(deviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

  // 고유 이미지 목록 추출
  const images = [...new Set(
    result.data
      .filter((item: any) => item.image_path)
      .map((item: any) => item.image_path)
  )]

  // 발송 설정 조회 (대시보드에서 설정한 값)
  const { data: settingsData } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['send_start_time', 'send_message_delay', 'send_file_delay'])

  const settings: Record<string, string | number> = {
    send_start_time: '04:00',
    send_message_delay: 3,
    send_file_delay: 6,
  }
  settingsData?.forEach(row => {
    const val = row.value
    settings[row.key] = typeof val === 'string' ? val.replace(/^"|"$/g, '') : val
  })

  return NextResponse.json({
    ok: true,
    data: result.data,
    total: result.data.length,
    date: todayKST(),
    generated: result.generated,
    images,
    settings,
  })
}
