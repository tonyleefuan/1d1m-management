/**
 * Bitly API로 URL 축약. 실패 시 원본 URL 반환.
 */
export async function shortenUrl(url: string): Promise<string> {
  const token = process.env.BITLY_API_TOKEN
  if (!token) return url

  try {
    const res = await fetch('https://api-ssl.bitly.com/v4/shorten', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ long_url: url, domain: 'bit.ly' }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return url
    const data = await res.json()
    return data.link || url
  } catch {
    return url
  }
}

/**
 * 텍스트 내 모든 URL을 축약 URL로 치환.
 * 이미 축약된 URL(bit.ly, tinyurl.com 등)은 건너뜀.
 */
export async function shortenUrlsInText(text: string): Promise<string> {
  const urlRegex = /https?:\/\/[^\s\]\)]+/g
  const urls = text.match(urlRegex) || []
  const skipDomains = ['bit.ly', 'bitly.com', 'tinyurl.com', 't.co', 'havehad.info']

  let result = text
  for (const url of urls) {
    if (skipDomains.some(d => url.includes(d))) continue
    const shortened = await shortenUrl(url)
    if (shortened !== url) {
      result = result.replace(url, shortened)
    }
  }
  return result
}
