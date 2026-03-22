import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { generateDailyMessages } from '@/lib/ai/message-generator'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  // Dual auth: CRON_SECRET or session
  const authHeader = request.headers.get('authorization')
  const cronSecret = authHeader?.replace('Bearer ', '')
  const isValidCron = cronSecret === process.env.CRON_SECRET

  if (!isValidCron) {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(request.url)
  const sku = searchParams.get('sku') || undefined
  const articleUrl = searchParams.get('article_url') || undefined

  // Default target date: tomorrow KST
  let targetDate = searchParams.get('date')
  if (!targetDate) {
    const tomorrow = new Date()
    tomorrow.setHours(tomorrow.getHours() + 9) // UTC → KST
    tomorrow.setDate(tomorrow.getDate() + 1)
    targetDate = tomorrow.toISOString().slice(0, 10)
  }

  const results = await generateDailyMessages(targetDate, sku, articleUrl)

  return NextResponse.json({ ok: true, date: targetDate, results })
}
