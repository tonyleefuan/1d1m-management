/**
 * 주문 데이터 CSV 임포트 스크립트
 *
 * "1D1M - Order.csv"에서 CS용 주문 기록만 저장한다.
 * - customers: 이름, phone_last4, kakao_friend_name(이름/뒷4자리), 이메일
 *   (전화번호 원본은 저장하지 않음 — 기존 고객 매칭용으로만 사용)
 * - orders: 주문번호, 주문일, 금액
 * - order_items, subscriptions 등은 건드리지 않음
 *
 * 사용법:
 *   npx tsx scripts/import-orders.ts <csv_path> [--dry-run]
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// .env.local 로드
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const CSV_PATH = process.argv[2]
const IS_DRY_RUN = process.argv.includes('--dry-run')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE = 500

if (!CSV_PATH) {
  console.error('Usage: npx tsx scripts/import-orders.ts <csv_path> [--dry-run]')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// --- Types ---

interface CSVRow {
  '\uC8FC\uBB38\uC77C': string
  '\uC8FC\uBB38\uBC88\uD638': string
  '\uC8FC\uBB38\uC790 \uC774\uB984': string
  '\uC8FC\uBB38\uC790 \uC774\uBA54\uC77C': string
  '\uC8FC\uBB38\uC790 \uBC88\uD638': string
  '\uCD5C\uC885\uC8FC\uBB38\uAE08\uC561': string
  [key: string]: string
}

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

function parseAmount(v: string): number {
  if (!v) return 0
  return parseInt(v.replace(/[^0-9-]/g, '')) || 0
}

function normalizeDate(v: string): string | null {
  if (!v) return null
  const trimmed = v.trim()
  // 이미 정상 형식: "2024-09-28" or "2024-09-28 17:59"
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10)  // YYYY-MM-DD만 추출
  }
  // 한국어 형식: "2026. 1. 3 오후 5:28:21" or "2026. 3. 15"
  const koMatch = trimmed.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  if (koMatch) {
    const y = koMatch[1]
    const m = koMatch[2].padStart(2, '0')
    const d = koMatch[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

// --- Main ---

async function main() {
  if (IS_DRY_RUN) console.log('[DRY-RUN] No data will be written\n')

  console.log('Reading CSV:', CSV_PATH)
  if (!fs.existsSync(CSV_PATH)) { console.error('File not found'); process.exit(1) }

  const raw = fs.readFileSync(CSV_PATH, 'utf-8')
  const rows: CSVRow[] = parse(raw, {
    columns: true, skip_empty_lines: true,
    quote: '"', escape: '"', relax_column_count: true, trim: true,
  })
  console.log(`Total rows: ${rows.length}`)

  // test 주문 제외, 주문번호 있는 것만
  const realRows = rows.filter(r => {
    const no = r['\uC8FC\uBB38\uBC88\uD638']?.trim()
    return no && !no.startsWith('test-')
  })
  console.log(`Real orders (excl test): ${realRows.length}`)

  // ─── 1. 고객 dedup (전화번호 기준) ───
  const phoneMap = new Map<string, { name: string; email: string; phone: string }>()
  for (const r of realRows) {
    const phone = r['\uC8FC\uBB38\uC790 \uBC88\uD638']?.trim()
    if (!phone) continue
    if (!phoneMap.has(phone)) {
      phoneMap.set(phone, {
        phone,
        name: r['\uC8FC\uBB38\uC790 \uC774\uB984']?.trim() || '',
        email: r['\uC8FC\uBB38\uC790 \uC774\uBA54\uC77C']?.trim() || '',
      })
    }
  }
  const uniquePhones = Array.from(phoneMap.keys())
  console.log(`\nUnique customers: ${uniquePhones.length}`)

  // 기존 고객 조회
  const phoneToId = new Map<string, string>()
  for (let i = 0; i < uniquePhones.length; i += BATCH_SIZE) {
    const batch = uniquePhones.slice(i, i + BATCH_SIZE)
    const { data } = await supabase.from('customers').select('id, phone').in('phone', batch)
    data?.forEach(c => phoneToId.set(c.phone, c.id))
  }
  console.log(`  Existing in DB: ${phoneToId.size}`)

  // 신규 고객 생성
  const newPhones = uniquePhones.filter(p => !phoneToId.has(p))
  console.log(`  New to create: ${newPhones.length}`)

  let customersCreated = 0
  let customersErrors = 0
  if (!IS_DRY_RUN && newPhones.length > 0) {
    for (let i = 0; i < newPhones.length; i += BATCH_SIZE) {
      const batch = newPhones.slice(i, i + BATCH_SIZE)
      const customerRows = batch.map(phone => {
        const info = phoneMap.get(phone)!
        const last4 = phone.slice(-4)
        return {
          name: info.name,
          // phone은 저장하지 않음 (전화번호 원본 비저장 정책)
          phone_last4: last4,
          kakao_friend_name: `${info.name}/${last4}`,
          email: info.email || null,
        }
      })
      // phone 없이 insert하므로, phone → id 매핑을 위해 phone_last4 + name으로 재조회 필요
      const { data, error } = await retryAsync(() =>
        supabase.from('customers').insert(customerRows).select('id, name, phone_last4')
      )
      if (error) {
        console.error(`  Batch error:`, error.message)
        customersErrors += batch.length
      } else {
        // insert 순서와 batch 순서가 동일하므로 인덱스로 매핑
        data?.forEach((c, idx) => {
          if (idx < batch.length) phoneToId.set(batch[idx], c.id)
        })
        customersCreated += data?.length || 0
      }
    }
  } else if (IS_DRY_RUN) {
    customersCreated = newPhones.length
    newPhones.forEach(p => phoneToId.set(p, 'mock'))
  }
  console.log(`  Created: ${customersCreated}, Errors: ${customersErrors}`)

  // 기존 고객 이메일 업데이트 (이메일 없는 경우만)
  let emailUpdated = 0
  if (!IS_DRY_RUN) {
    // 기존 고객 중 이메일 없는 사람 찾기
    const existingPhones = uniquePhones.filter(p => phoneToId.has(p) && !newPhones.includes(p))
    for (let i = 0; i < existingPhones.length; i += BATCH_SIZE) {
      const batch = existingPhones.slice(i, i + BATCH_SIZE)
      const { data: customers } = await supabase
        .from('customers')
        .select('id, phone, email')
        .in('phone', batch)
        .is('email', null)

      if (customers?.length) {
        for (const c of customers) {
          const info = phoneMap.get(c.phone)
          if (info?.email) {
            await supabase.from('customers').update({ email: info.email }).eq('id', c.id)
            emailUpdated++
          }
        }
      }
    }
  }
  if (emailUpdated > 0) console.log(`  Email updated: ${emailUpdated}`)

  // ─── 2. 주문 dedup (주문번호 기준) ───
  console.log('\nProcessing orders...')
  const orderMap = new Map<string, { orderNo: string; orderedAt: string; amount: number; phone: string }>()
  for (const r of realRows) {
    const orderNo = r['\uC8FC\uBB38\uBC88\uD638']?.trim()
    const phone = r['\uC8FC\uBB38\uC790 \uBC88\uD638']?.trim()
    if (!orderNo || !phone) continue
    if (!orderMap.has(orderNo)) {
      orderMap.set(orderNo, {
        orderNo,
        orderedAt: normalizeDate(r['\uC8FC\uBB38\uC77C'] || '') || '',
        amount: parseAmount(r['\uCD5C\uC885\uC8FC\uBB38\uAE08\uC561']),
        phone,
      })
    }
  }
  const orderNos = Array.from(orderMap.keys())
  console.log(`  Unique orders: ${orderNos.length}`)

  // 기존 주문 확인
  const existingOrderNos = new Set<string>()
  for (let i = 0; i < orderNos.length; i += BATCH_SIZE) {
    const batch = orderNos.slice(i, i + BATCH_SIZE)
    const { data } = await supabase.from('orders').select('imweb_order_no').in('imweb_order_no', batch)
    data?.forEach(o => existingOrderNos.add(o.imweb_order_no))
  }
  const newOrderNos = orderNos.filter(no => !existingOrderNos.has(no))
  console.log(`  Existing in DB: ${existingOrderNos.size}`)
  console.log(`  New to create: ${newOrderNos.length}`)

  let ordersCreated = 0
  let ordersErrors = 0
  if (!IS_DRY_RUN && newOrderNos.length > 0) {
    for (let i = 0; i < newOrderNos.length; i += BATCH_SIZE) {
      const batch = newOrderNos.slice(i, i + BATCH_SIZE)
      const orderRows = batch
        .map(orderNo => {
          const info = orderMap.get(orderNo)!
          const customerId = phoneToId.get(info.phone)
          if (!customerId) return null
          return {
            imweb_order_no: orderNo,
            customer_id: customerId,
            total_amount: info.amount,
            ordered_at: info.orderedAt || null,
          }
        })
        .filter(Boolean) as any[]

      if (orderRows.length === 0) continue

      const { error, count } = await retryAsync(() =>
        supabase.from('orders').insert(orderRows)
      )
      if (error) {
        console.error(`  Batch error:`, error.message)
        ordersErrors += batch.length
      } else {
        ordersCreated += orderRows.length
      }
    }
  } else if (IS_DRY_RUN) {
    ordersCreated = newOrderNos.length
  }
  console.log(`  Created: ${ordersCreated}, Errors: ${ordersErrors}`)

  // ─── 결과 ───
  console.log('\n' + '='.repeat(50))
  console.log('Summary')
  console.log('='.repeat(50))
  console.log(`Customers: ${customersCreated} created, ${phoneToId.size - customersCreated} existing`)
  console.log(`Orders: ${ordersCreated} created, ${existingOrderNos.size} existing`)
  console.log(IS_DRY_RUN ? '\n[DRY-RUN] No changes made' : '\nDone!')
  console.log('='.repeat(50) + '\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
