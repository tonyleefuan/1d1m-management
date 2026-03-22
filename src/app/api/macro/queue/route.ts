import { NextResponse } from 'next/server'
import { generateQueueForDevice } from '@/lib/queue-generator'
import { todayKST } from '@/lib/day'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const deviceId = searchParams.get('device_id')
  if (!deviceId) return NextResponse.json({ error: 'device_id required' }, { status: 400 })

  const result = await generateQueueForDevice(deviceId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({
    data: result.data,
    total: result.data.length,
    date: todayKST(),
    generated: result.generated,
  })
}
