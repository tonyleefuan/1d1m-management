import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = 'claude-sonnet-4-20250514'

const URL_SAFETY_RULE = `

[절대 규칙 — URL]
- URL을 절대로 만들어내거나 추측하지 마라. 웹 검색에서 실제로 찾은 URL만 사용하라.
- bit.ly, tinyurl.com 등 축약 URL을 직접 만들지 마라. URL 축약은 시스템이 자동으로 처리한다.
- 원문 링크가 필요한 위치에는 검색에서 찾은 실제 기사 URL 원본을 그대로 넣어라.
- 가짜 URL, 존재하지 않는 URL, 추측 URL을 포함하면 절대 안 된다.
- URL을 찾지 못했으면 해당 위치에 "[URL 없음]"이라고 표시하라.`

/**
 * 웹 검색 도구를 사용하여 뉴스 검색/선정
 */
export async function searchNews(
  searchPrompt: string,
  recentHistory: string,
  articleUrl?: string
): Promise<string> {
  const userMessage = articleUrl
    ? `다음 기사를 사용하세요: ${articleUrl}\n\n최근 7일간 이미 다룬 주제:\n${recentHistory}`
    : `오늘 날짜 기준으로 뉴스를 검색하세요.\n\n최근 7일간 이미 다룬 주제 (중복 회피):\n${recentHistory}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: searchPrompt + URL_SAFETY_RULE,
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
  recentHistory: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: generationPrompt + URL_SAFETY_RULE,
    messages: [{
      role: 'user',
      content: `아래 뉴스를 바탕으로 메시지를 작성하세요.\n\n## 뉴스 내용\n${newsContext}\n\n## 최근 메시지 (참고용, 톤/포맷 참조)\n${recentHistory}`
    }],
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
    max_tokens: 4096,
    system: generationPrompt + URL_SAFETY_RULE,
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
