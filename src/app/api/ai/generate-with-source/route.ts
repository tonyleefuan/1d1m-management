export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateFromSource, type SourceItem } from '@/lib/ai/claude'
import { fetchSourceContext } from '@/lib/ai/news-fetcher'
import { shortenUrls, shortenUrlsInText, shortenUrl } from '@/lib/ai/url-shortener'

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

    // 기사 접근 실패 감지 — URL 여러 개 중 일부만 실패하면 성공한 것만 사용
    const sourceUrlList = combinedText.match(/https?:\/\/[^\s,\n<>"']+/g) || []
    if (sourceUrlList.length > 0) {
      const successCount = (sourceContext.match(/## 기사 원문/g) || []).length
      const failCount = (sourceContext.match(/\[기사 접속 실패/g) || []).length
      if (successCount === 0 && failCount > 0) {
        // 전부 실패 — 에러 반환
        console.warn(`[AI] 전체 기사 접근 실패 (${failCount}건) — URL: ${combinedText.slice(0, 300)}`)
        return NextResponse.json(
          { error: `기사 링크 ${failCount}건 모두 접근 실패. 사이트가 봇을 차단하거나 접속 불가 상태입니다. 기사 본문을 직접 복사해서 붙여넣어 주세요.` },
          { status: 422 }
        )
      }
      if (failCount > 0) {
        console.warn(`[AI] 일부 기사 접근 실패 (성공 ${successCount}건, 실패 ${failCount}건)`)
      }
    }

    const images = imageSources.map(s => ({
      data: s.content,
      media_type: s.media_type,
    }))

    const fullGenPrompt = prompt.additional_prompt
      ? `${prompt.generation_prompt}\n\n## 추가 지시\n${prompt.additional_prompt}`
      : prompt.generation_prompt

    // 사용자 소스에서 URL 추출 → Bitly로 미리 축약
    const urlRegex = /https?:\/\/[^\s\]\)]+/g
    const sourceUrls = combinedText.match(urlRegex) || []
    const urlMapping = sourceUrls.length > 0 ? await shortenUrls(sourceUrls) : {}

    // AI 생성 (축약 URL 매핑 전달)
    let message = await generateFromSource(
      prompt.search_prompt,
      fullGenPrompt,
      sourceContext,
      images,
      recentHistory,
      date,
      urlMapping,
    )

    // 1단계: urlMapping에 있는 원본 URL → bit.ly로 강제 치환 (Claude가 원본 URL을 사용한 경우)
    for (const [original, shortened] of Object.entries(urlMapping)) {
      message = message.replaceAll(original, shortened)
    }

    // 2단계: Claude가 만든 가짜 축약 URL(bbc.in, reut.rs 등)을 bit.ly로 교체
    // urlMapping의 bit.ly URL을 순서대로 매칭
    const fakeShortDomains = ['bbc.in', 'reut.rs', 'nyti.ms', 'wapo.st', 'cnn.it', 'bloom.bg', 'econ.st']
    const bitlyUrls = Object.values(urlMapping)
    if (bitlyUrls.length > 0) {
      const fakeUrlRegex = new RegExp(`https?://(?:${fakeShortDomains.join('|')})/[^\\s\\]\\)]+`, 'g')
      const fakeUrls = message.match(fakeUrlRegex) || []
      let bitlyIdx = 0
      for (const fakeUrl of fakeUrls) {
        if (bitlyIdx < bitlyUrls.length) {
          message = message.replace(fakeUrl, bitlyUrls[bitlyIdx])
          bitlyIdx++
        }
      }
    }

    // 3단계: 나머지 URL도 Bitly로 축약 (웹 검색으로 찾은 새 URL 등)
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
    console.error('[generate-with-source] Error:', err instanceof Error ? `${err.name}: ${err.message}` : err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 }
    )
  }
}
