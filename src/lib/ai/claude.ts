import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const MODEL = 'claude-sonnet-4-20250514'

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
    system: searchPrompt,
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
    system: generationPrompt,
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
    system: generationPrompt,
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
