import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = 'claude-sonnet-4-20250514'

const SYSTEM_RULES = `

[규칙]
- 볼드체(**), 이탤릭(*), 마크다운 서식을 사용하지 마라. 순수 Plain Text만 출력하라.
- 영어 문법에 주의하라. 특히 3인칭 단수 동사 일치 (Iran marks, not Iran mark).
- URL은 검색에서 찾은 원본 URL을 그대로 넣어라. 축약하거나 만들어내지 마라.`

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
 * 검색된 뉴스를 바탕으로 메시지 생성
 */
export async function generateMessage(
  generationPrompt: string,
  newsContext: string,
  recentHistory: string,
  targetDate: string,
  formatReference?: string
): Promise<string> {
  let userContent = `아래 뉴스를 바탕으로 메시지를 작성하세요.\n\n대상 날짜: ${targetDate}\n날짜 표기는 반드시 "${targetDate}"을 사용하세요. 직접 계산하지 마세요.\n\n## 뉴스 내용\n${newsContext}`

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

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('\n')
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
