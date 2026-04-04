import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { searchNews, generateMessage } from '@/lib/ai/claude'
import { shortenUrlsInText } from '@/lib/ai/url-shortener'
import { fetchNewsForProduct, fetchArticleContent } from '@/lib/ai/news-fetcher'

export const maxDuration = 300

interface GenerateResult {
  sku: string
  status: 'success' | 'error'
  message_id?: string
  error?: string
}

async function generateForProduct(
  productId: string,
  sku: string,
  searchPrompt: string,
  generationPrompt: string,
  targetDate: string,
  articleUrl?: string
): Promise<GenerateResult> {
  try {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: history } = await supabase
      .from('daily_messages')
      .select('send_date, content')
      .eq('product_id', productId)
      .gte('send_date', sevenDaysAgo.toISOString().slice(0, 10))
      .order('send_date', { ascending: false })
      .limit(7)

    const recentHistory = (history || [])
      .map(h => `[${h.send_date}] ${h.content.slice(0, 200)}...`)
      .join('\n\n')

    // 기사 URL이 제공되면 서버에서 직접 fetch하여 본문 추출
    let articleContent = ''
    if (articleUrl) {
      articleContent = await fetchArticleContent(articleUrl)
    }
    const sourceContent = articleUrl ? '' : await fetchNewsForProduct(sku)
    const searchContext = sourceContent
      ? `${searchPrompt}\n\n## 소스 페이지에서 가져온 헤드라인/기사 목록\n${sourceContent}`
      : searchPrompt
    const newsContext = articleContent
      ? articleContent
      : await searchNews(searchContext, recentHistory, targetDate)
    let message = await generateMessage(generationPrompt, newsContext, recentHistory, targetDate)
    message = await shortenUrlsInText(message)

    const { data: existing } = await supabase
      .from('daily_messages')
      .select('id, status')
      .eq('product_id', productId)
      .eq('send_date', targetDate)
      .single()

    if (existing?.status === 'approved') {
      return { sku, status: 'error', error: '이미 승인된 메시지가 있습니다' }
    }

    const { data, error } = await supabase
      .from('daily_messages')
      .upsert({
        product_id: productId,
        send_date: targetDate,
        content: message,
        status: 'draft',
      }, { onConflict: 'product_id,send_date' })
      .select('id')
      .single()

    if (error) throw error
    return { sku, status: 'success', message_id: data.id }
  } catch (err) {
    return { sku, status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

// Vercel Cron은 GET으로 호출
export async function GET(request: NextRequest) {
  return handleGenerateDaily(request)
}

export async function POST(request: NextRequest) {
  return handleGenerateDaily(request)
}

async function handleGenerateDaily(request: NextRequest) {
  // Dual auth
  const authHeader = request.headers.get('authorization')
  const envSecret = process.env.CRON_SECRET
  const cronSecret = authHeader?.replace('Bearer ', '')
  const isValidCron = !!envSecret && cronSecret === envSecret

  if (!isValidCron) {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: '인증 필요' }, { status: 401 })
    }
  }

  const { searchParams } = new URL(request.url)
  const skuFilter = searchParams.get('sku') || undefined
  const articleUrl = searchParams.get('article_url') || undefined
  const stream = searchParams.get('stream') === '1'

  let targetDate = searchParams.get('date')
  if (!targetDate) {
    // KST 기준 내일 날짜 계산 (Intl API로 정확한 타임존 처리)
    const now = new Date()
    const kstFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })
    const todayKST = kstFormatter.format(now)
    const tomorrow = new Date(todayKST + 'T00:00:00+09:00')
    tomorrow.setDate(tomorrow.getDate() + 1)
    targetDate = tomorrow.toISOString().slice(0, 10)
  }

  // 상품 + 프롬프트 로드
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, sku_code, title')
    .eq('message_type', 'realtime')
    .eq('is_active', true)

  const products = skuFilter
    ? (allProducts || []).filter(p => p.sku_code === skuFilter)
    : (allProducts || [])

  if (!products.length) {
    return NextResponse.json({ ok: false, error: '상품 없음' }, { status: 404 })
  }

  // 스트리밍 모드 (대시보드 버튼용)
  if (stream) {
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        send({ type: 'start', total: products.length, date: targetDate })

        const results: GenerateResult[] = []

        for (let i = 0; i < products.length; i++) {
          const p = products[i]
          send({ type: 'progress', current: i + 1, total: products.length, sku: p.sku_code, title: p.title, phase: 'generating' })

          const { data: prompt } = await supabase
            .from('product_prompts')
            .select('search_prompt, generation_prompt, additional_prompt')
            .eq('product_id', p.id)
            .single()

          let result: GenerateResult
          if (!prompt) {
            result = { sku: p.sku_code, status: 'error', error: '프롬프트 미설정' }
          } else {
            const fullGenPrompt = prompt.additional_prompt
              ? `${prompt.generation_prompt}\n\n## 추가 지시\n${prompt.additional_prompt}`
              : prompt.generation_prompt

            result = await generateForProduct(
              p.id, p.sku_code,
              prompt.search_prompt, fullGenPrompt,
              targetDate!, articleUrl
            )
          }

          results.push(result)
          send({ type: 'done', current: i + 1, total: products.length, sku: p.sku_code, result })
        }

        send({ type: 'complete', results })
        controller.close()
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }

  // 일반 모드 (Cron용) — 배치 처리
  const results: GenerateResult[] = []
  const batchSize = 3
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(
      batch.map(async (p) => {
        const { data: prompt } = await supabase
          .from('product_prompts')
          .select('search_prompt, generation_prompt, additional_prompt')
          .eq('product_id', p.id)
          .single()

        if (!prompt) return { sku: p.sku_code, status: 'error' as const, error: '프롬프트 미설정' }

        const fullGenPrompt = prompt.additional_prompt
          ? `${prompt.generation_prompt}\n\n## 추가 지시\n${prompt.additional_prompt}`
          : prompt.generation_prompt

        return generateForProduct(p.id, p.sku_code, prompt.search_prompt, fullGenPrompt, targetDate!, articleUrl)
      })
    )
    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : { sku: 'unknown', status: 'error', error: r.reason?.message || 'Unknown error' })
    }
  }

  return NextResponse.json({ ok: true, date: targetDate, results })
}
