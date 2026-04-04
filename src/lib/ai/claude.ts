import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_RULES = `
[규칙]
- Plain Text만 출력. 볼드/이탤릭/마크다운 금지.
- 영어 3인칭 단수 동사 일치에 주의.
- 글자수 제한 준수. "N자 내외" = N의 ±10%.
- URL: 축약 매핑 제공 시 해당 bit.ly만 사용. 제3자 축약 URL 생성 금지. 매핑 없으면 원본 URL. URL 추측/생성 금지.`

function logTokenUsage(label: string, usage: any) {
  const cached = usage.cache_read_input_tokens || 0
  const created = usage.cache_creation_input_tokens || 0
  console.log(`[AI:${label}] tokens — input: ${usage.input_tokens - cached}, cache_read: ${cached}, cache_write: ${created}, output: ${usage.output_tokens}`)
}

/** 프롬프트를 캐싱 가능한 system 블록으로 변환 */
function buildCachedSystem(prompt: string): Anthropic.Messages.TextBlockParam[] {
  return [
    {
      type: 'text' as const,
      text: prompt + SYSTEM_RULES,
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

/**
 * 프롬프트에서 글자수 규칙을 추출
 * 예: "영어 헤드라인 (70자 내외)" → { headline: 70, summary: 150 }
 */
function extractCharLimits(prompt: string): { headline?: number; summary?: number } {
  const limits: { headline?: number; summary?: number } = {}

  const headlineMatch = prompt.match(/헤드라인[^(]*\((\d+)자/)
  if (headlineMatch) limits.headline = parseInt(headlineMatch[1])

  const summaryMatch = prompt.match(/요약[^(]*\((\d+)자/)
  if (summaryMatch) limits.summary = parseInt(summaryMatch[1])

  return limits
}

interface CharViolation {
  index: number
  field: 'headline' | 'summary'
  text: string
  actual: number
  limit: number
}

/**
 * 생성된 메시지에서 글자수 위반 항목을 찾음
 * 번호 이모지(1️⃣~9️⃣) 기반으로 뉴스 블록을 파싱
 */
function findCharViolations(
  message: string,
  limits: { headline?: number; summary?: number }
): CharViolation[] {
  if (!limits.headline && !limits.summary) return []

  const violations: CharViolation[] = []
  // 각 뉴스 블록을 번호 이모지로 분리
  const blocks = message.split(/(?=[\d]️⃣)/).filter(b => /^[\d]️⃣/.test(b))

  for (let i = 0; i < blocks.length; i++) {
    const lines = blocks[i].split('\n').map(l => l.trim()).filter(Boolean)
    // 첫 줄: "1️⃣ 영어 헤드라인"
    const headlineLine = lines[0]?.replace(/^[\d]️⃣\s*/, '') || ''

    if (limits.headline && headlineLine.length > limits.headline * 1.2) {
      violations.push({
        index: i + 1,
        field: 'headline',
        text: headlineLine,
        actual: headlineLine.length,
        limit: limits.headline,
      })
    }

    // 요약: "• " 로 시작하는 영어 줄 (첫 번째 bullet)
    const bulletLines = lines.filter(l => l.startsWith('•'))
    const engSummary = bulletLines[0]?.replace(/^•\s*/, '') || ''

    if (limits.summary && engSummary.length > limits.summary * 1.2) {
      violations.push({
        index: i + 1,
        field: 'summary',
        text: engSummary,
        actual: engSummary.length,
        limit: limits.summary,
      })
    }
  }

  return violations
}

/**
 * 글자수 위반 항목을 수정 요청
 */
async function fixCharViolations(
  message: string,
  violations: CharViolation[],
  generationPrompt: string,
): Promise<string> {
  const instructions = violations.map(v => {
    const fieldName = v.field === 'headline' ? '헤드라인' : '요약'
    return `- ${v.index}번 ${fieldName}: ${v.actual}자→${v.limit}자 이내로 축약`
  }).join('\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildCachedSystem(generationPrompt),
    messages: [
      { role: 'user', content: `아래 메시지에서 글자수 위반 항목만 수정하고 나머지는 그대로 유지하세요. URL/한글/단어 변경 금지.\n\n${instructions}\n\n원본 메시지:\n${message}` },
    ],
  })
  logTokenUsage('fix-char', response.usage)

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * 웹 검색 도구를 사용하여 뉴스 검색/선정
 */
export async function searchNews(
  searchPrompt: string,
  recentHistory: string,
  targetDate: string,
  articleUrl?: string
): Promise<string> {
  const userMessage = articleUrl
    ? `기사 URL: ${articleUrl}\n날짜: ${targetDate}\n\n기존 주제 (중복 회피):\n${recentHistory}`
    : `날짜: ${targetDate}\n\n기존 주제 (중복 회피):\n${recentHistory}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildCachedSystem(searchPrompt),
    tools: articleUrl ? [] : [
      { type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }
    ],
    messages: [{ role: 'user', content: userMessage }],
  })
  logTokenUsage('search-news', response.usage)

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * YYYY-MM-DD → "YYYY.MM.DD 요일" 변환
 */
function formatDateWithDay(dateStr: string): string {
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dayName = days[dt.getUTCDay()]
  return `${dateStr.replace(/-/g, '.')} ${dayName}`
}

/**
 * 검색된 뉴스를 바탕으로 메시지 생성
 */
export async function generateMessage(
  generationPrompt: string,
  newsContext: string,
  _recentHistory: string,   // searchNews에서 이미 사용됨 — 중복 전송 제거
  targetDate: string,
  formatReference?: string,
  urlMapping?: Record<string, string>
): Promise<string> {
  const formattedDate = formatDateWithDay(targetDate)
  let userContent = `날짜: ${formattedDate}\n\n## 뉴스\n${newsContext}`

  if (urlMapping && Object.keys(urlMapping).length > 0) {
    const mappingLines = Object.entries(urlMapping)
      .map(([original, shortened]) => `${original} → ${shortened}`)
      .join('\n')
    userContent += `\n\n## 축약 URL (반드시 사용)\n${mappingLines}`
  }

  if (formatReference) {
    userContent += `\n\n## 포맷 참조\n${formatReference}`
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildCachedSystem(generationPrompt),
    messages: [{ role: 'user', content: userContent }],
  })
  logTokenUsage('generate-msg', response.usage)

  let result = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  // 글자수 검증 + 1회 재생성
  const charLimits = extractCharLimits(generationPrompt)
  const violations = findCharViolations(result, charLimits)
  if (violations.length > 0) {
    console.log(`[AI] 글자수 위반 ${violations.length}건, 수정 요청:`, violations.map(v => `${v.index}번 ${v.field} ${v.actual}→${v.limit}자`))
    result = await fixCharViolations(result, violations, generationPrompt)
  }

  return result
}

export type SourceItem = { type: 'text'; content: string } | { type: 'image'; content: string; media_type: string }

/**
 * 사용자가 제공한 소스(텍스트+이미지)를 기반으로 웹 검색 + 메시지 생성
 * - 이미지: Claude vision으로 내용 파악 (검색어 스크린샷 등)
 * - 텍스트: 기사 본문, 검색어, 메모 등
 * - web_search: 항상 활성화하여 최신 기사 검색 가능
 */
export async function generateFromSource(
  searchPrompt: string,
  generationPrompt: string,
  sourceContext: string,
  images: { data: string; media_type: string }[],
  recentHistory: string,
  targetDate: string,
  urlMapping?: Record<string, string>,
): Promise<string> {
  const formattedDate = formatDateWithDay(targetDate)

  // Step 1: 소스 분석 + 웹 검색 (필요시)
  const searchBlocks: Anthropic.ContentBlockParam[] = []

  // 이미지 추가
  for (const img of images) {
    searchBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: img.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: img.data },
    })
  }

  const hasArticleContent = sourceContext.includes('## 기사 원문')

  searchBlocks.push({
    type: 'text',
    text: [
      `대상 날짜: ${formattedDate}`,
      '',
      images.length > 0 ? '위 이미지에서 관련 정보(검색어, 키워드 등)를 파악하세요.' : '',
      '',
      sourceContext ? `## 사용자 제공 소스\n${sourceContext}` : '(소스 없음 — 웹 검색으로 최신 뉴스를 찾으세요)',
      '',
      `## 최근 7일간 이미 다룬 주제 (중복 회피)\n${recentHistory}`,
    ].filter(Boolean).join('\n'),
  })

  const searchResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildCachedSystem(searchPrompt),
    tools: hasArticleContent ? [] : [
      { type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }
    ],
    messages: [{ role: 'user', content: searchBlocks }],
  })
  logTokenUsage('source-search', searchResponse.usage)

  const newsContext = searchResponse.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  // Step 2: 메시지 생성
  return generateMessage(generationPrompt, newsContext, recentHistory, targetDate, undefined, urlMapping)
}

/**
 * 기존 메시지를 지시에 따라 수정
 * - 메시지 2중 전송 제거 (user→assistant echo 패턴 삭제)
 * - 프롬프트 캐싱 + max_tokens 최적화
 */
export async function modifyMessage(
  currentMessage: string,
  instruction: string,
  generationPrompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildCachedSystem(generationPrompt),
    messages: [
      { role: 'user', content: `현재 메시지:\n${currentMessage}\n\n지시: ${instruction}\n\n수정된 전체 메시지만 출력하세요.` },
    ],
  })
  logTokenUsage('modify-msg', response.usage)

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}
