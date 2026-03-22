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
