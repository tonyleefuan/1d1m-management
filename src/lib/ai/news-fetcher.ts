/**
 * 뉴스 소스 페이지를 서버에서 가져와 헤드라인/키워드를 추출
 * Claude가 웹 검색 없이도 기사를 선정할 수 있도록 사전 데이터 제공
 */

// 상품별 소스 URL 정의
const SOURCE_URLS: Record<string, string[]> = {
  'SUB-45': ['https://www.bbc.com'],
  'SUB-46': ['https://www.hankyung.com/economy'],
  'SUB-60': ['https://news.daum.net/society'],
  'SUB-63': ['https://news.daum.net/society', 'https://news.naver.com/section/102'],
  'SUB-64': ['https://news.naver.com/breakingnews/section/101/260', 'https://news.daum.net/estate'],
  'SUB-76': ['https://www.bbc.com/business'],
  'SUB-95': ['https://loword.co.kr/keywordTrend', 'https://news.naver.com'],
}

/**
 * HTML에서 텍스트와 링크를 추출
 */
function extractFromHtml(html: string, baseUrl: string): string {
  // script, style, nav, footer 제거
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // a 태그에서 링크+텍스트 추출
  const links: string[] = []
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = linkRegex.exec(cleaned)) !== null) {
    const href = match[1]
    const text = match[2].replace(/<[^>]+>/g, '').trim()
    if (text.length > 10 && text.length < 200) {
      let fullUrl = href
      if (href.startsWith('/')) {
        const origin = new URL(baseUrl).origin
        fullUrl = origin + href
      }
      if (fullUrl.startsWith('http')) {
        links.push(`- ${text} (${fullUrl})`)
      }
    }
  }

  // h1, h2, h3 태그에서 헤드라인 추출
  const headlines: string[] = []
  const headlineRegex = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi
  while ((match = headlineRegex.exec(cleaned)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim()
    if (text.length > 5 && text.length < 200) {
      headlines.push(`- ${text}`)
    }
  }

  const result: string[] = []

  if (headlines.length > 0) {
    result.push('[헤드라인]')
    result.push(...headlines.slice(0, 20))
  }

  if (links.length > 0) {
    result.push('\n[기사 링크]')
    result.push(...links.slice(0, 30))
  }

  return result.join('\n')
}

/**
 * URL에서 페이지를 가져와 콘텐츠 추출
 */
async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; 1D1M-Bot/1.0)',
        'Accept': 'text/html',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return `[${url} 접속 실패: ${res.status}]`
    const html = await res.text()
    const extracted = extractFromHtml(html, url)
    return extracted || `[${url} 에서 콘텐츠 추출 실패]`
  } catch (err) {
    return `[${url} 접속 실패: ${err instanceof Error ? err.message : String(err)}]`
  }
}

/**
 * 텍스트에서 URL을 추출
 */
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s,\n<>"']+/g
  return [...new Set(text.match(urlRegex) || [])]
}

/**
 * 사용자가 입력한 소스 컨텍스트(링크들 + 메모)를 처리
 * - URL은 자동 추출하여 각각 fetch
 * - URL이 아닌 텍스트는 그대로 컨텍스트로 전달
 */
export async function fetchSourceContext(sourceText: string): Promise<string> {
  const urls = extractUrls(sourceText)
  // URL이 아닌 텍스트 추출 (사용자 메모/주제/키워드)
  let userNotes = sourceText
  for (const url of urls) {
    userNotes = userNotes.replace(url, '').trim()
  }
  userNotes = userNotes.replace(/\n{3,}/g, '\n\n').trim()

  const parts: string[] = []

  if (userNotes) {
    parts.push(`## 사용자 지시/메모\n${userNotes}`)
  }

  if (urls.length > 0) {
    const fetched = await Promise.all(
      urls.map(url => fetchArticleContent(url))
    )
    parts.push(...fetched)
  }

  return parts.join('\n\n---\n\n')
}

/**
 * 단일 기사 URL에서 본문 텍스트를 추출 (사용자가 직접 제공한 URL용)
 */
export async function fetchArticleContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return `[기사 접속 실패: ${res.status}]`
    const html = await res.text()

    // script, style, nav, footer, aside 등 불필요한 태그 제거
    let cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')

    // article 태그가 있으면 그 안의 내용만 사용
    const articleMatch = cleaned.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i)
    if (articleMatch) cleaned = articleMatch[1]

    // 제목 추출
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    // h1 추출
    const h1Match = cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
    const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : ''

    // p 태그에서 본문 추출
    const paragraphs: string[] = []
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi
    let match
    while ((match = pRegex.exec(cleaned)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, '').trim()
      if (text.length > 20) paragraphs.push(text)
    }

    // 본문 콘텐츠 결정
    let bodyText = ''
    if (paragraphs.length > 0) {
      bodyText = paragraphs.slice(0, 50).join('\n\n')
    } else {
      // p 태그가 없으면 전체 텍스트에서 추출
      const allText = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      bodyText = allText.slice(0, 5000)
    }

    // 본문이 너무 짧으면 접근 실패로 판단 (봇 차단, JS-only 페이지 등)
    if (bodyText.length < 100 && !title && !h1) {
      return `[기사 접속 실패: 본문 추출 불가 — 봇 차단 또는 JavaScript 전용 페이지일 수 있습니다]`
    }

    const result: string[] = []
    result.push(`## 기사 원문 (${url})`)
    if (title || h1) result.push(`제목: ${h1 || title}`)
    result.push('')
    result.push(bodyText)

    return result.join('\n')
  } catch (err) {
    return `[기사 접속 실패: ${err instanceof Error ? err.message : String(err)}]`
  }
}

/**
 * 상품별 소스 페이지들을 가져와 통합 콘텐츠 반환
 */
export async function fetchNewsForProduct(sku: string): Promise<string> {
  const urls = SOURCE_URLS[sku]
  if (!urls || urls.length === 0) return ''

  const results = await Promise.all(
    urls.map(async (url) => {
      const content = await fetchPage(url)
      return `=== ${url} ===\n${content}`
    })
  )

  return results.join('\n\n')
}
