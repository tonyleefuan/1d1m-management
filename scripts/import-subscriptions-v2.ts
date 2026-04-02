/**
 * 구독 데이터 임포트 스크립트 v2 (xlsx 기반)
 *
 * 새 CSV/XLSX 컬럼:
 *   주문일, 고객명, 카톡이름, 상품, 기간, 시작일, 종료일, Day, D-Day, Status, PC 번호, Sort
 *
 * 매핑 규칙:
 *   - Status: Live → live, Pending+Day있음 → pause, Pending+Day없음 → pending
 *   - Sort: 아주 빨리→1, 빨리→2, 보통→3, 늦게→4
 *   - PC 번호 → send_devices.phone_number → device_id
 *   - 카톡이름 → kakao_friend_name (그대로)
 *   - 고객: phone 저장 안 함, phone_last4 + kakao_friend_name만
 *
 * 사용법:
 *   npx tsx scripts/import-subscriptions-v2.ts <xlsx_path> [--dry-run]
 */

import path from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const FILE_PATH = process.argv[2]
const IS_DRY_RUN = process.argv.includes('--dry-run')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE = 500

if (!FILE_PATH) {
  console.error('Usage: npx tsx scripts/import-subscriptions-v2.ts <xlsx_path> [--dry-run]')
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

/** Excel serial number → YYYY-MM-DD */
function excelDateToStr(serial: number | string | null): string | null {
  if (serial == null || serial === '') return null
  const num = typeof serial === 'string' ? Number(serial) : serial
  if (isNaN(num) || num < 1) return null
  // Excel epoch: 1900-01-01 = 1, but JS Date epoch is 1970-01-01
  // Excel has a bug treating 1900 as leap year, so subtract 2 for dates after 1900-02-28
  const epoch = new Date(1899, 11, 30) // Dec 30, 1899
  const date = new Date(epoch.getTime() + num * 86400000)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseSendPriority(sort: string): 1 | 2 | 3 | 4 {
  switch (sort?.trim()) {
    case '아주 빨리': return 1
    case '빨리': return 2
    case '보통': return 3
    case '늦게': return 4
    default: return 3
  }
}

function parseStatus(status: string, day: number | null): 'live' | 'pending' | 'pause' | 'archive' | 'cancel' {
  const s = status?.trim()
  if (s === 'Live') return 'live'
  if (s === 'Pending') {
    // Day 값이 있으면 pause (발송 중이었지만 정지), 없으면 pending (미시작)
    return (day != null && day > 0) ? 'pause' : 'pending'
  }
  if (s === 'Archive' || s === 'archive') return 'archive'
  if (s === 'Cancel' || s === 'cancel') return 'cancel'
  if (s === 'Pause' || s === 'pause') return 'pause'
  return 'live'
}

function extractPhoneLast4(kakaoName: string): string | null {
  if (!kakaoName) return null
  // 이름/뒷4자리 형식: "이정환/5802"
  const slashIdx = kakaoName.lastIndexOf('/')
  if (slashIdx >= 0) {
    return kakaoName.slice(slashIdx + 1)
  }
  // 전화번호 형식: "010-4466-8940"
  if (/^01\d/.test(kakaoName)) {
    return kakaoName.replace(/-/g, '').slice(-4)
  }
  return null
}

// --- Main ---

async function main() {
  if (IS_DRY_RUN) console.log('[DRY-RUN] No data will be written\n')

  // xlsx 읽기
  console.log('Reading file:', FILE_PATH)
  const XLSX = require('xlsx')
  const wb = XLSX.readFile(FILE_PATH)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  const header = rawData[0] as string[]
  const dataRows = rawData.slice(1).filter(r => r.length > 1 && r[1]) // 빈 행 제외
  console.log(`  Total rows: ${dataRows.length}`)
  console.log(`  Columns: ${header.join(', ')}`)

  // 컬럼 인덱스
  const col = {
    orderedAt: header.indexOf('주문일'),
    name: header.indexOf('고객명'),
    kakao: header.indexOf('카톡이름'),
    sku: header.indexOf('상품'),
    duration: header.indexOf('기간'),
    startDate: header.indexOf('시작일'),
    endDate: header.indexOf('종료일'),
    day: header.indexOf('Day'),
    dDay: header.indexOf('D-Day'),
    status: header.indexOf('Status'),
    pcPhone: header.indexOf('PC 번호'),
    sort: header.indexOf('Sort'),
  }

  // DB 참조 데이터 로드
  console.log('\nLoading DB references...')
  const [products, devices] = await Promise.all([
    supabase.from('products').select('id, sku_code'),
    supabase.from('send_devices').select('id, phone_number'),
  ])

  const productMap = new Map<string, string>()
  products.data?.forEach(p => productMap.set(p.sku_code, p.id))
  console.log(`  Products: ${productMap.size}`)

  const deviceMap = new Map<string, string>()
  devices.data?.forEach(d => deviceMap.set(d.phone_number, d.id))
  console.log(`  Devices: ${deviceMap.size}`)

  // 데이터 파싱
  console.log('\nParsing data...')

  // 고객 dedup (카톡이름 기준)
  const customerMap = new Map<string, { name: string; kakao: string; phoneLast4: string | null }>()
  const subscriptions: Array<{
    customerKey: string
    productSku: string
    devicePhone: string
    status: 'live' | 'pending' | 'pause' | 'archive' | 'cancel'
    startDate: string | null
    endDate: string | null
    durationDays: number
    day: number
    lastSentDay: number
    sendPriority: 1 | 2 | 3 | 4
    isPaused: boolean
  }> = []

  const missingSkus = new Set<string>()
  const missingDevices = new Set<string>()
  let skippedRows = 0

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i]
    const name = String(r[col.name] || '').trim()
    const kakao = String(r[col.kakao] || '').trim()
    const sku = String(r[col.sku] || '').trim()
    const pcPhone = String(r[col.pcPhone] || '').trim()
    const statusStr = String(r[col.status] || '').trim()
    const sortStr = String(r[col.sort] || '').trim()
    const dayVal = r[col.day] != null ? Number(r[col.day]) : null
    const durationVal = Number(r[col.duration]) || 0

    // 필수 필드 검증
    if (!name || !kakao || !sku) {
      skippedRows++
      continue
    }

    // 상품 확인
    if (!productMap.has(sku)) {
      missingSkus.add(sku)
      skippedRows++
      continue
    }

    // 디바이스 확인
    if (pcPhone && !deviceMap.has(pcPhone)) {
      missingDevices.add(pcPhone)
    }

    // 고객 dedup (카톡이름 기준)
    if (!customerMap.has(kakao)) {
      customerMap.set(kakao, {
        name,
        kakao,
        phoneLast4: extractPhoneLast4(kakao),
      })
    }

    const status = parseStatus(statusStr, dayVal)
    const day = (dayVal != null && !isNaN(dayVal)) ? dayVal : 0

    subscriptions.push({
      customerKey: kakao,
      productSku: sku,
      devicePhone: pcPhone,
      status,
      startDate: excelDateToStr(r[col.startDate]),
      endDate: excelDateToStr(r[col.endDate]),
      durationDays: durationVal,
      day,
      lastSentDay: Math.max(0, day - 1),
      sendPriority: parseSendPriority(sortStr),
      isPaused: status === 'pause',
    })
  }

  console.log(`  Unique customers: ${customerMap.size}`)
  console.log(`  Subscriptions: ${subscriptions.length}`)
  console.log(`  Skipped rows: ${skippedRows}`)
  if (missingSkus.size > 0) console.log(`  Missing SKUs: ${Array.from(missingSkus).join(', ')}`)
  if (missingDevices.size > 0) console.log(`  Missing devices: ${Array.from(missingDevices).join(', ')}`)

  // ─── 고객 생성 (기존 고객 먼저 조회) ───
  console.log('\nProcessing customers...')
  const kakaoToCustomerId = new Map<string, string>()

  if (!IS_DRY_RUN) {
    // 기존 고객 조회 (kakao_friend_name 기준)
    const PAGE_SIZE = 1000
    let page = 0
    while (true) {
      const { data, error } = await supabase
        .from('customers')
        .select('id, kakao_friend_name')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      if (error || !data || data.length === 0) break
      data.forEach(c => {
        if (c.kakao_friend_name) kakaoToCustomerId.set(c.kakao_friend_name, c.id)
      })
      page++
    }
    console.log(`  Existing customers: ${kakaoToCustomerId.size}`)

    // 신규 고객만 생성
    const newCustomers = Array.from(customerMap.values()).filter(c => !kakaoToCustomerId.has(c.kakao))
    console.log(`  New to create: ${newCustomers.length}`)

    let created = 0
    for (let i = 0; i < newCustomers.length; i += BATCH_SIZE) {
      const batch = newCustomers.slice(i, i + BATCH_SIZE)
      const rows = batch.map(c => ({
        name: c.name,
        kakao_friend_name: c.kakao,
        phone_last4: c.phoneLast4,
      }))

      const { data, error } = await retryAsync(() =>
        supabase.from('customers').insert(rows).select('id, kakao_friend_name')
      )

      if (error) {
        console.error(`  Batch error:`, error.message)
      } else {
        data?.forEach(c => {
          if (c.kakao_friend_name) kakaoToCustomerId.set(c.kakao_friend_name, c.id)
        })
        created += data?.length || 0
      }

      if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, newCustomers.length)}/${newCustomers.length}`)
      }
    }
    console.log(`  Created: ${created}, Total: ${kakaoToCustomerId.size}`)
  } else {
    customerMap.forEach((_, kakao) => kakaoToCustomerId.set(kakao, 'mock'))
    console.log(`  [DRY-RUN] ${kakaoToCustomerId.size} customers`)
  }

  // ─── 구독 생성 ───
  console.log('\nCreating subscriptions...')
  let subsCreated = 0
  let subsErrors = 0
  let subsSkipped = 0

  if (!IS_DRY_RUN) {
    for (let i = 0; i < subscriptions.length; i += BATCH_SIZE) {
      const batch = subscriptions.slice(i, i + BATCH_SIZE)
      const rows = batch
        .map(s => {
          const customerId = kakaoToCustomerId.get(s.customerKey)
          const productId = productMap.get(s.productSku)
          const deviceId = deviceMap.get(s.devicePhone) || null

          if (!customerId || !productId) {
            subsSkipped++
            return null
          }

          return {
            customer_id: customerId,
            product_id: productId,
            device_id: deviceId,
            order_item_id: null,
            status: s.status,
            start_date: s.startDate,
            end_date: s.endDate,
            duration_days: s.durationDays,
            day: s.day,
            last_sent_day: s.lastSentDay,
            paused_days: 0,
            is_cancelled: false,
            send_priority: s.sendPriority,
          }
        })
        .filter(Boolean) as any[]

      if (rows.length === 0) continue

      const { error } = await retryAsync(() =>
        supabase.from('subscriptions').insert(rows)
      )

      if (error) {
        console.error(`  Batch error:`, error.message)
        subsErrors += rows.length
      } else {
        subsCreated += rows.length
      }

      if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
        console.log(`  Progress: ${Math.min(i + BATCH_SIZE, subscriptions.length)}/${subscriptions.length}`)
      }
    }
  } else {
    subsCreated = subscriptions.length
  }

  // ─── 결과 ───
  console.log('\n' + '='.repeat(50))
  console.log('Summary')
  console.log('='.repeat(50))
  console.log(`Customers: ${kakaoToCustomerId.size} created`)
  console.log(`Subscriptions: ${subsCreated} created, ${subsErrors} errors, ${subsSkipped} skipped`)
  if (missingSkus.size > 0) console.log(`Missing products: ${Array.from(missingSkus).join(', ')}`)
  if (missingDevices.size > 0) console.log(`Missing devices: ${Array.from(missingDevices).join(', ')}`)
  console.log(IS_DRY_RUN ? '\n[DRY-RUN] No changes made' : '\nDone!')
  console.log('='.repeat(50) + '\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
