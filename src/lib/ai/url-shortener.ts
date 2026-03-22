/**
 * TinyURL API로 URL 축약. 실패 시 원본 URL 반환.
 */
export async function shortenUrl(url: string): Promise<string> {
  try {
    const res = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return url
    const shortened = await res.text()
    return shortened.startsWith('http') ? shortened : url
  } catch {
    return url
  }
}

/**
 * 텍스트 내 모든 URL을 축약 URL로 치환.
 * 이미 축약된 URL(tinyurl.com, bit.ly 등)은 건너뜀.
 */
export async function shortenUrlsInText(text: string): Promise<string> {
  const urlRegex = /https?:\/\/[^\s\]\)]+/g
  const urls = text.match(urlRegex) || []
  const skipDomains = ['tinyurl.com', 'bit.ly', 'bitly.com', 't.co']

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
