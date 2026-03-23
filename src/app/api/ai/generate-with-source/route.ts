import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateFromSource, type SourceItem } from '@/lib/ai/claude'
import { fetchSourceContext } from '@/lib/ai/news-fetcher'
import { shortenUrlsInText } from '@/lib/ai/url-shortener'

export const maxDuration = 300

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  try {
    const body = await req.json()
    const { product_id, date, sources } = body as {
      product_id: string
      date: string
      sources: SourceItem[]
    }

    if (!product_id || !date) {
      return NextResponse.json({ error: 'product_id, date 필수' }, { status: 400 })
    }

    // 상품 + 프롬프트 로드
    const [{ data: product }, { data: prompt }] = await Promise.all([
      supabase.from('products').select('id, sku_code, title').eq('id', product_id).single(),
      supabase.from('product_prompts').select('search_prompt, generation_prompt, additional_prompt').eq('product_id', product_id).single(),
    ])

    if (!product) return NextResponse.json({ error: '상품 없음' }, { status: 404 })
    if (!prompt) return NextResponse.json({ error: '프롬프트 미설정' }, { status: 404 })

    // 승인된 메시지 보호
    const { data: existing } = await supabase
      .from('daily_messages')
      .select('id, status')
      .eq('product_id', product_id)
      .eq('send_date', date)
      .single()

    if (existing?.status === 'approved') {
      return NextResponse.json({ error: '이미 승인된 메시지가 있습니다' }, { status: 409 })
    }

    // 최근 7일 히스토리
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: history } = await supabase
      .from('daily_messages')
      .select('send_date, content')
      .eq('product_id', product_id)
      .gte('send_date', sevenDaysAgo.toISOString().slice(0, 10))
      .order('send_date', { ascending: false })
      .limit(7)

    const recentHistory = (history || [])
      .map(h => `[${h.send_date}] ${h.content.slice(0, 200)}...`)
      .join('\n\n')

    // 소스 처리: 텍스트 → URL fetch, 이미지 → base64
    const textSources = (sources || []).filter(s => s.type === 'text').map(s => s.content)
    const imageSources = (sources || []).filter(s => s.type === 'image') as { type: 'image'; content: string; media_type: string }[]

    // 텍스트 소스에서 URL 추출 + fetch
    const combinedText = textSources.join('\n')
    const sourceContext = combinedText ? await fetchSourceContext(combinedText) : ''

    // 기사 접근 실패 감지 — 사용자에게 알려줌
    const hasUrls = !!combinedText.match(/https?:\/\//)
    const hasArticleContent = sourceContext.includes('## 기사 원문')
    if (hasUrls && !hasArticleContent) {
      console.warn(`[AI] 기사 접근 실패 — URL: ${combinedText.slice(0, 300)}`)
      return NextResponse.json(
        { error: '기사 링크에 접근하지 못했습니다. 사이트가 봇을 차단하거나 접속이 불가한 상태입니다. 기사 본문을 직접 복사해서 붙여넣어 주세요.' },
        { status: 422 }
      )
    }

    const images = imageSources.map(s => ({
      data: s.content,
      media_type: s.media_type,
    }))

    const fullGenPrompt = prompt.additional_prompt
      ? `${prompt.generation_prompt}\n\n## 추가 지시\n${prompt.additional_prompt}`
      : prompt.generation_prompt

    // AI 생성
    let message = await generateFromSource(
      prompt.search_prompt,
      fullGenPrompt,
      sourceContext,
      images,
      recentHistory,
      date,
    )
    message = await shortenUrlsInText(message)

    // DB 저장 (draft)
    const { data, error } = await supabase
      .from('daily_messages')
      .upsert({
        product_id,
        send_date: date,
        content: message,
        status: 'draft',
      }, { onConflict: 'product_id,send_date' })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, content: message, message_id: data.id })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 }
    )
  }
}
