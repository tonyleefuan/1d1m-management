import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_RULES = `

[규칙]
- 볼드체(**), 이탤릭(*), 마크다운 서식을 사용하지 마라. 순수 Plain Text만 출력하라.
- 영어 문법에 주의하라. 특히 3인칭 단수 동사 일치 (Iran marks, not Iran mark).
- 글자수 제한이 명시된 경우 반드시 준수하라. "N자 내외"는 N의 ±10% 범위를 의미한다.
- URL 규칙 (매우 중요):
  1. 축약 URL 매핑이 제공되면 반드시 해당 bit.ly URL만 사용하라. 절대 다른 URL로 대체하지 마라.
  2. bbc.in, reut.rs, tinyurl.com 등 제3자 축약 URL을 절대 만들거나 사용하지 마라.
  3. 축약 URL 매핑이 없는 경우에만, 검색에서 찾은 원본 전체 URL(예: https://www.bbc.com/news/...)을 그대로 넣어라.
  4. URL을 추측하거나 기억에서 만들어내지 마라. 검색 결과에 없는 URL은 절대 포함하지 마라.`

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
    const fieldName = v.field === 'headline' ? '영어 헤드라인' : '영어 요약'
    return `- ${v.index}번 뉴스의 ${fieldName}: 현재 ${v.actual}자 → ${v.limit}자 이내로 줄이세요. 핵심만 남기고 축약하세요.`
  }).join('\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: generationPrompt + SYSTEM_RULES,
    messages: [
      { role: 'user', content: '아래 메시지를 작성해주세요.' },
      { role: 'assistant', content: message },
      {
        role: 'user',
        content: `글자수 규칙을 위반한 항목이 있습니다. 아래 항목만 수정하고, 나머지는 그대로 유지하세요.\n\n${instructions}\n\n수정된 전체 메시지를 출력하세요. URL, 한글 번역, 단어 등 다른 부분은 절대 변경하지 마세요.`,
      },
    ],
  })

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
    ? `다음 기사를 사용하세요: ${articleUrl}\n\n대상 날짜: ${targetDate}\n\n최근 7일간 이미 다룬 주제:\n${recentHistory}`
    : `오늘 날짜 기준으로 뉴스를 검색하세요.\n\n대상 날짜: ${targetDate}\n\n최근 7일간 이미 다룬 주제 (중복 회피):\n${recentHistory}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: searchPrompt + SYSTEM_RULES,
    tools: articleUrl ? [] : [
      { type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

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
  recentHistory: string,
  targetDate: string,
  formatReference?: string,
  urlMapping?: Record<string, string>
): Promise<string> {
  const formattedDate = formatDateWithDay(targetDate)
  let userContent = `아래 뉴스를 바탕으로 메시지를 작성하세요.\n\n대상 날짜: ${formattedDate}\n날짜 표기는 반드시 "${formattedDate}"을 사용하세요. 직접 계산하지 마세요.\n\n## 뉴스 내용\n${newsContext}`

  if (urlMapping && Object.keys(urlMapping).length > 0) {
    const mappingLines = Object.entries(urlMapping)
      .map(([original, shortened]) => `${original} → ${shortened}`)
      .join('\n')
    userContent += `\n\n## 기사 원본 링크 축약 URL (반드시 아래 축약 URL을 사용하세요. 다른 URL을 만들거나 검색하지 마세요.)\n${mappingLines}`
  }

  if (formatReference) {
    userContent += `\n\n## 포맷 참조 (아래 메시지와 동일한 포맷/톤/구조로 작성하세요)\n${formatReference}`
  }

  userContent += `\n\n## 최근 다룬 주제 (중복 회피용)\n${recentHistory}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: generationPrompt + SYSTEM_RULES,
    messages: [{ role: 'user', content: userContent }],
  })

  let result = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  // 글자수 검증 + 1회 재생성
  const charLimits = extractCharLimits(generationPrompt)
  const violations = findCharViolations(result, charLimits)
  if (violations.length > 0) {
    console.log(`[AI] 글자수 위반 ${violations.length}건 감지, 수정 요청:`, violations.map(v => `${v.index}번 ${v.field} ${v.actual}→${v.limit}자`))
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
    max_tokens: 8192,
    system: searchPrompt + SYSTEM_RULES,
    tools: hasArticleContent ? [] : [
      { type: 'web_search_20250305' as const, name: 'web_search', max_uses: 5 }
    ],
    messages: [{ role: 'user', content: searchBlocks }],
  })

  const newsContext = searchResponse.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')

  // Step 2: 메시지 생성
  return generateMessage(generationPrompt, newsContext, recentHistory, targetDate, undefined, urlMapping)
}

/**
 * 기존 메시지를 지시에 따라 수정
 */
export async function modifyMessage(
  currentMessage: string,
  instruction: string,
  generationPrompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: generationPrompt + SYSTEM_RULES,
    messages: [
      { role: 'user', content: `현재 메시지:\n${currentMessage}` },
      { role: 'assistant', content: currentMessage },
      { role: 'user', content: `다음 지시에 따라 위 메시지를 수정해주세요: ${instruction}\n\n수정된 전체 메시지만 출력하세요.` },
    ],
  })

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}
