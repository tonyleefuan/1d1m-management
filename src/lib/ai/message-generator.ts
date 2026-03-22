import { supabase } from '@/lib/supabase'
import { searchNews, generateMessage } from './claude'
import { shortenUrlsInText } from './url-shortener'

interface GenerateResult {
  sku: string
  status: 'success' | 'error'
  message_id?: string
  error?: string
}

async function generateForProduct(
  productId: string,
  sku: string,
  searchPrompt: string,
  generationPrompt: string,
  targetDate: string,
  articleUrl?: string
): Promise<GenerateResult> {
  try {
    // 1. Recent 7-day history
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const { data: history } = await supabase
      .from('daily_messages')
      .select('send_date, content')
      .eq('product_id', productId)
      .gte('send_date', sevenDaysAgo.toISOString().slice(0, 10))
      .order('send_date', { ascending: false })
      .limit(7)

    const recentHistory = (history || [])
      .map(h => `[${h.send_date}] ${h.content.slice(0, 200)}...`)
      .join('\n\n')

    // 2. Search news
    const newsContext = await searchNews(searchPrompt, recentHistory, articleUrl)

    // 3. Generate message
    let message = await generateMessage(generationPrompt, newsContext, recentHistory)

    // 4. Shorten URLs inline
    message = await shortenUrlsInText(message)

    // 5. Check if approved message already exists
    const { data: existing } = await supabase
      .from('daily_messages')
      .select('id, status')
      .eq('product_id', productId)
      .eq('send_date', targetDate)
      .single()

    if (existing?.status === 'approved') {
      return { sku, status: 'error', error: '이미 승인된 메시지가 있습니다' }
    }

    // 6. Upsert as draft
    const { data, error } = await supabase
      .from('daily_messages')
      .upsert({
        product_id: productId,
        send_date: targetDate,
        content: message,
        status: 'draft',
      }, { onConflict: 'product_id,send_date' })
      .select('id')
      .single()

    if (error) throw error
    return { sku, status: 'success', message_id: data.id }
  } catch (err) {
    return { sku, status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
}

function chunks<T>(arr: T[], n: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < arr.length; i += n) {
    result.push(arr.slice(i, i + n))
  }
  return result
}

export async function generateDailyMessages(
  targetDate: string,
  skuFilter?: string,
  articleUrl?: string
): Promise<GenerateResult[]> {
  // Use raw query to join products with product_prompts
  const { data: products, error } = await supabase
    .from('products')
    .select('id, sku_code')
    .eq('message_type', 'realtime')
    .eq('is_active', true)
    .then(async (res) => {
      if (res.error || !res.data) return res
      // Filter by SKU if provided
      const filtered = skuFilter
        ? res.data.filter(p => p.sku_code === skuFilter)
        : res.data
      return { ...res, data: filtered }
    })

  if (error || !products?.length) {
    return [{ sku: skuFilter || 'ALL', status: 'error', error: '상품 조회 실패' }]
  }

  const results: GenerateResult[] = []
  const batches = chunks(products, 3)

  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map(async (p) => {
        // Get prompts for this product
        const { data: prompt } = await supabase
          .from('product_prompts')
          .select('search_prompt, generation_prompt')
          .eq('product_id', p.id)
          .single()

        if (!prompt) {
          return { sku: p.sku_code, status: 'error' as const, error: '프롬프트 미설정' }
        }

        return generateForProduct(
          p.id, p.sku_code,
          prompt.search_prompt, prompt.generation_prompt,
          targetDate, articleUrl
        )
      })
    )

    for (const r of batchResults) {
      results.push(r.status === 'fulfilled' ? r.value : {
        sku: 'unknown', status: 'error',
        error: r.reason?.message || 'Unknown error'
      })
    }
  }

  return results
}
