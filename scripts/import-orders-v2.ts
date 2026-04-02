/**
 * 주문 데이터 임포트 스크립트 v2
 *
 * CSV 컬럼: 카톡이름, 주문일, 주문번호
 *
 * 매핑 규칙:
 *   - 카톡이름 → customers.kakao_friend_name 으로 고객 매칭
 *   - 주문번호 → orders.imweb_order_no
 *   - 주문일 → orders.ordered_at (YYYY-MM-DD)
 *   - test 주문 (주문번호가 test-로 시작) 제외
 *   - 중복 주문번호 dedup
 *
 * 사용법:
 *   npx tsx scripts/import-orders-v2.ts <csv_path> [--dry-run]
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const CSV_PATH = process.argv[2]
const IS_DRY_RUN = process.argv.includes('--dry-run')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE = 500

if (!CSV_PATH) {
  console.error('Usage: npx tsx scripts/import-orders-v2.ts <csv_path> [--dry-run]')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// --- Helpers ---

async function retryAsync<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: any
  for (let i = 0; i < retries; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  throw lastErr
}

function normalizeDate(v: string): string | null {
  if (!v) return null
  const trimmed = v.trim()
  // "2024-09-28 17:59" or "2024-09-28"
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)
  }
  return null
}

// --- Main ---

async function main() {
  if (IS_DRY_RUN) console.log('[DRY-RUN] No data will be written\n')

  console.log('Reading CSV:', CSV_PATH)
  if (!fs.existsSync(CSV_PATH)) { console.error('File not found'); process.exit(1) }

  const raw = fs.readFileSync(CSV_PATH, 'utf-8')
  const rows: Record<string, string>[] = parse(raw, {
    columns: true, skip_empty_lines: true,
    quote: '"', escape: '"', relax_column_count: true, trim: true,
  })
  console.log(`Total rows: ${rows.length}`)

  // test 주문 제외
  const realRows = rows.filter(r => {
    const orderNo = r['주문번호']?.trim()
    return orderNo && !orderNo.startsWith('test-')
  })
  console.log(`Real orders (excl test): ${realRows.length}`)

  // ─── 1. 주문 dedup (주문번호 기준) ───
  const orderMap = new Map<string, { orderNo: string; orderedAt: string; kakaoName: string }>()
  for (const r of realRows) {
    const orderNo = r['주문번호']?.trim()
    const kakaoName = r['카톡이름']?.trim()
    if (!orderNo || !kakaoName) continue
    if (!orderMap.has(orderNo)) {
      orderMap.set(orderNo, {
        orderNo,
        orderedAt: normalizeDate(r['주문일'] || '') || '',
        kakaoName,
      })
    }
  }
  const uniqueOrderNos = Array.from(orderMap.keys())
  console.log(`\nUnique orders: ${uniqueOrderNos.length}`)

  // ─── 2. 고객 매칭 (kakao_friend_name 기준) ───
  console.log('\nLoading customers...')
  const kakaoToId = new Map<string, string>()
  const PAGE_SIZE = 1000
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, kakao_friend_name')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error || !data || data.length === 0) break
    data.forEach(c => {
      if (c.kakao_friend_name) kakaoToId.set(c.kakao_friend_name, c.id)
    })
    page++
  }
  console.log(`  Customers loaded: ${kakaoToId.size}`)

  // 매칭 안 되는 카톡이름 확인
  const unmatchedKakao = new Set<string>()
  for (const info of orderMap.values()) {
    if (!kakaoToId.has(info.kakaoName)) {
      unmatchedKakao.add(info.kakaoName)
    }
  }
  if (unmatchedKakao.size > 0) {
    console.log(`  Unmatched kakao names: ${unmatchedKakao.size}`)
    if (unmatchedKakao.size <= 20) {
      console.log(`    ${Array.from(unmatchedKakao).join(', ')}`)
    } else {
      console.log(`    First 20: ${Array.from(unmatchedKakao).slice(0, 20).join(', ')}`)
    }
  }

  // ─── 3. 기존 주문 확인 ───
  console.log('\nChecking existing orders...')
  const existingOrderNos = new Set<string>()
  for (let i = 0; i < uniqueOrderNos.length; i += BATCH_SIZE) {
    const batch = uniqueOrderNos.slice(i, i + BATCH_SIZE)
    const { data } = await supabase.from('orders').select('imweb_order_no').in('imweb_order_no', batch)
    data?.forEach(o => existingOrderNos.add(o.imweb_order_no))
  }
  const newOrderNos = uniqueOrderNos.filter(no => !existingOrderNos.has(no))
  console.log(`  Existing in DB: ${existingOrderNos.size}`)
  console.log(`  New to create: ${newOrderNos.length}`)

  // ─── 4. 주문 생성 ───
  console.log('\nCreating orders...')
  let ordersCreated = 0
  let ordersSkipped = 0
  let ordersErrors = 0

  if (!IS_DRY_RUN && newOrderNos.length > 0) {
    for (let i = 0; i < newOrderNos.length; i += BATCH_SIZE) {
      const batch = newOrderNos.slice(i, i + BATCH_SIZE)
      const orderRows = batch
        .map(orderNo => {
          const info = orderMap.get(orderNo)!
          const customerId = kakaoToId.get(info.kakaoName)
          if (!customerId) {
            ordersSkipped++
            return null
          }
          return {
            imweb_order_no: orderNo,
            customer_id: customerId,
            total_amount: 0,
            ordered_at: info.orderedAt || '1970-01-01',
          }
        })
        .filter(Boolean) as any[]

      if (orderRows.length === 0) continue

      const { error } = await retryAsync(() =>
        supabase.from('orders').insert(orderRows)
      )
      if (error) {
        console.error(`  Batch error:`, error.message)
        ordersErrors += orderRows.length
      } else {
        ordersCreated += orderRows.length
      }

      if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, newOrderNos.length)}/${newOrderNos.length}`)
      }
    }
  } else if (IS_DRY_RUN) {
    // dry run: count what would be created
    for (const orderNo of newOrderNos) {
      const info = orderMap.get(orderNo)!
      if (kakaoToId.has(info.kakaoName)) ordersCreated++
      else ordersSkipped++
    }
  }

  // ─── 결과 ───
  console.log('\n' + '='.repeat(50))
  console.log('Summary')
  console.log('='.repeat(50))
  console.log(`Total unique orders: ${uniqueOrderNos.length}`)
  console.log(`Already in DB: ${existingOrderNos.size}`)
  console.log(`Created: ${ordersCreated}`)
  console.log(`Skipped (no customer match): ${ordersSkipped}`)
  console.log(`Errors: ${ordersErrors}`)
  if (unmatchedKakao.size > 0) console.log(`Unmatched kakao names: ${unmatchedKakao.size}`)
  console.log(IS_DRY_RUN ? '\n[DRY-RUN] No changes made' : '\nDone!')
  console.log('='.repeat(50) + '\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
