/**
 * 초기화 + 재임포트 통합 스크립트
 *
 * 1단계: 주문 전체 삭제
 * 2단계: 구독 없는 중복 고객 삭제
 * 3단계: 기존 고객 kakao_friend_name 수정 (Dashboard CSV F열 사용) + phone→null
 * 4단계: 주문 재임포트 (Order CSV) — 기존 고객은 phone_last4+name으로 매칭
 *
 * 사용법:
 *   npx tsx scripts/reset-and-reimport.ts <dashboard_csv> <order_csv> [--dry-run]
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const DASHBOARD_CSV = process.argv[2]
const ORDER_CSV = process.argv[3]
const IS_DRY_RUN = process.argv.includes('--dry-run')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE = 500
const PAGE_SIZE = 1000

if (!DASHBOARD_CSV || !ORDER_CSV) {
  console.error('Usage: npx tsx scripts/reset-and-reimport.ts <dashboard_csv> <order_csv> [--dry-run]')
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

function parseAmount(v: string): number {
  if (!v) return 0
  return parseInt(v.replace(/[^0-9-]/g, '')) || 0
}

function normalizeDate(v: string): string | null {
  if (!v) return null
  const trimmed = v.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)
  const koMatch = trimmed.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
  if (koMatch) {
    return `${koMatch[1]}-${koMatch[2].padStart(2, '0')}-${koMatch[3].padStart(2, '0')}`
  }
  return null
}

async function fetchAllPaginated(table: string, select: string, filter?: (q: any) => any): Promise<any[]> {
  const all: any[] = []
  let page = 0
  while (true) {
    let query = supabase.from(table).select(select).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (filter) query = filter(query)
    const { data, error } = await query
    if (error) { console.error(`DB error (${table}):`, error.message); break }
    if (!data || data.length === 0) break
    all.push(...data)
    page++
  }
  return all
}

// --- Main ---

async function main() {
  if (IS_DRY_RUN) console.log('[DRY-RUN] No data will be written\n')

  // CSV 읽기
  console.log('Reading Dashboard CSV:', DASHBOARD_CSV)
  const dashRaw = fs.readFileSync(DASHBOARD_CSV, 'utf-8')
  const dashRows: any[] = parse(dashRaw, {
    columns: true, skip_empty_lines: true,
    quote: '"', escape: '"', relax_column_count: true, trim: true,
  })
  console.log(`  Dashboard rows: ${dashRows.length}`)

  console.log('Reading Order CSV:', ORDER_CSV)
  const orderRaw = fs.readFileSync(ORDER_CSV, 'utf-8')
  const orderRows: any[] = parse(orderRaw, {
    columns: true, skip_empty_lines: true,
    quote: '"', escape: '"', relax_column_count: true, trim: true,
  })
  console.log(`  Order rows: ${orderRows.length}`)

  // ═══════════════════════════════════════════════
  // 1단계: 주문 전체 삭제
  // ═══════════════════════════════════════════════
  console.log('\n' + '='.repeat(50))
  console.log('1단계: 주문 전체 삭제')
  console.log('='.repeat(50))

  if (!IS_DRY_RUN) {
    // order_items가 orders를 참조할 수 있으므로 먼저 삭제
    const { error: oiErr } = await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (oiErr) console.error('  order_items 삭제 에러:', oiErr.message)
    else console.log('  order_items 삭제 완료')

    const { error: ordErr } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    if (ordErr) console.error('  orders 삭제 에러:', ordErr.message)
    else console.log('  orders 삭제 완료')
  } else {
    console.log('  [DRY-RUN] Would delete all order_items and orders')
  }

  // ═══════════════════════════════════════════════
  // 2단계: 구독 없는 중복 고객 삭제
  // ═══════════════════════════════════════════════
  console.log('\n' + '='.repeat(50))
  console.log('2단계: 구독 없는 중복 고객 삭제')
  console.log('='.repeat(50))

  // 구독이 있는 customer_id 목록
  const subsData = await fetchAllPaginated('subscriptions', 'customer_id')
  const customerIdsWithSubs = new Set(subsData.map(s => s.customer_id))
  console.log(`  구독 있는 고객 수: ${customerIdsWithSubs.size}`)

  // 전체 고객 조회
  const allCustomers = await fetchAllPaginated('customers', 'id, name, phone, phone_last4, kakao_friend_name, email')
  console.log(`  전체 고객 수: ${allCustomers.length}`)

  // 구독 없는 고객 = 중복으로 생성된 고객
  const orphanCustomers = allCustomers.filter(c => !customerIdsWithSubs.has(c.id))
  console.log(`  구독 없는 고객 (삭제 대상): ${orphanCustomers.length}`)

  if (!IS_DRY_RUN && orphanCustomers.length > 0) {
    const orphanIds = orphanCustomers.map(c => c.id)
    for (let i = 0; i < orphanIds.length; i += BATCH_SIZE) {
      const batch = orphanIds.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('customers').delete().in('id', batch)
      if (error) console.error(`  삭제 에러:`, error.message)
      if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
        console.log(`  진행: ${Math.min(i + BATCH_SIZE, orphanIds.length)}/${orphanIds.length}`)
      }
    }
    console.log(`  ${orphanCustomers.length}명 삭제 완료`)
  } else if (IS_DRY_RUN) {
    console.log(`  [DRY-RUN] Would delete ${orphanCustomers.length} orphan customers`)
  }

  // ═══════════════════════════════════════════════
  // 3단계: 기존 고객 kakao_friend_name 수정
  // ═══════════════════════════════════════════════
  console.log('\n' + '='.repeat(50))
  console.log('3단계: 기존 고객 kakao_friend_name 수정')
  console.log('='.repeat(50))

  // Dashboard CSV에서 매핑 구축:
  // G열(주문자 번호=실제전화) → F열(Mobile=카톡이름)
  // F열(Mobile=카톡이름) → G열(주문자 번호=실제전화)  ← 역매핑도 필요
  const phoneToKakaoName = new Map<string, string>()  // G열→F열 (실제전화→카톡이름)
  const kakaoToRealPhone = new Map<string, string>()   // F열→G열 (카톡이름→실제전화)
  for (const r of dashRows) {
    const realPhone = (r['주문자 번호'] || '').trim()  // G열: 실제 전화번호
    const kakaoName = (r['Mobile'] || '').trim()        // F열: 카톡이름
    if (realPhone && kakaoName) {
      if (!phoneToKakaoName.has(realPhone)) {
        phoneToKakaoName.set(realPhone, kakaoName)
      }
      if (!kakaoToRealPhone.has(kakaoName)) {
        kakaoToRealPhone.set(kakaoName, realPhone)
      }
    }
  }
  console.log(`  Dashboard CSV: ${phoneToKakaoName.size} phone→kakao mappings`)

  // 구독 있는 고객만 다시 조회 (삭제 후)
  const remainingCustomers = await fetchAllPaginated('customers', 'id, name, phone, phone_last4, kakao_friend_name, email')
  console.log(`  남은 고객: ${remainingCustomers.length}`)

  // ★ 핵심: phone → customer_id 매핑을 step 3에서 미리 구축
  //   - 구독 고객의 phone은 import-subscriptions에서 row.Mobile (= F열 = 카톡이름)로 저장됨
  //   - 일부는 fix-kakao-names가 이미 phone=null 처리함
  //   - Dashboard CSV: F열(카톡이름) → G열(실제전화) 역매핑 사용
  const realPhoneToCustomerId = new Map<string, string>()

  for (const c of remainingCustomers) {
    if (c.phone) {
      // c.phone은 import-subscriptions에서 row.Mobile(F열)로 저장된 값
      // Dashboard CSV에서 F열→G열 역매핑으로 실제 전화번호 얻기
      const realPhone = kakaoToRealPhone.get(c.phone)
      if (realPhone) {
        realPhoneToCustomerId.set(realPhone, c.id)
      }
      // c.phone 자체가 실제 전화번호인 경우도 처리 (혹시 모를 경우)
      if (/^01\d/.test(c.phone)) {
        realPhoneToCustomerId.set(c.phone, c.id)
      }
    }
  }
  console.log(`  실제전화→고객 매핑: ${realPhoneToCustomerId.size}`)

  let kakaoUpdated = 0
  let kakaoErrors = 0

  if (!IS_DRY_RUN) {
    for (let i = 0; i < remainingCustomers.length; i++) {
      const c = remainingCustomers[i]
      const dbPhone = c.phone

      let newKakao = c.kakao_friend_name
      let newLast4 = c.phone_last4

      if (dbPhone) {
        // dbPhone은 import-subscriptions에서 F열(Mobile=카톡이름)로 저장된 값
        // Dashboard CSV: F열(카톡이름) → G열(실제전화) 역매핑으로 실제 전화번호 얻기
        const realPhone = kakaoToRealPhone.get(dbPhone)

        if (realPhone) {
          // Dashboard CSV F열(Mobile)이 카톡이름
          // G열(주문자 번호) → F열(Mobile) 정방향 매핑에서 실제 카톡이름 가져오기
          const csvKakao = phoneToKakaoName.get(realPhone)
          newKakao = csvKakao || dbPhone
          newLast4 = realPhone.slice(-4)
        } else if (dbPhone.includes('/')) {
          // 이미 카톡이름 형식인 경우 그대로
          newKakao = dbPhone
          newLast4 = dbPhone.split('/').pop() || dbPhone.slice(-4)
        } else if (/^01\d/.test(dbPhone)) {
          // 실제 전화번호인 경우
          const csvKakao = phoneToKakaoName.get(dbPhone)
          if (csvKakao) newKakao = csvKakao
          newLast4 = dbPhone.slice(-4)
        } else {
          newLast4 = dbPhone.slice(-4)
        }
      }

      const { error } = await supabase
        .from('customers')
        .update({
          kakao_friend_name: newKakao,
          phone_last4: newLast4,
          phone: null,
        })
        .eq('id', c.id)

      if (error) {
        kakaoErrors++
        if (kakaoErrors <= 5) console.error(`  에러:`, error.message)
      } else {
        kakaoUpdated++
      }

      if ((i + 1) % 1000 === 0) {
        console.log(`  진행: ${i + 1}/${remainingCustomers.length}`)
      }
    }
    console.log(`  업데이트: ${kakaoUpdated}, 에러: ${kakaoErrors}`)
  } else {
    console.log(`  [DRY-RUN] Would update ${remainingCustomers.length} customers`)
  }

  // ═══════════════════════════════════════════════
  // 4단계: 주문 재임포트
  // ═══════════════════════════════════════════════
  console.log('\n' + '='.repeat(50))
  console.log('4단계: 주문 재임포트')
  console.log('='.repeat(50))

  // Order CSV에서 주문 데이터 추출
  const realOrderRows = orderRows.filter(r => {
    const no = (r['주문번호'] || '').trim()
    return no && !no.startsWith('test-')
  })
  console.log(`  유효 주문 행: ${realOrderRows.length}`)

  // 전화번호 → 고객 정보 (Order CSV에서)
  const orderPhoneMap = new Map<string, { name: string; email: string; phone: string }>()
  for (const r of realOrderRows) {
    const phone = (r['주문자 번호'] || '').trim()
    if (!phone) continue
    if (!orderPhoneMap.has(phone)) {
      orderPhoneMap.set(phone, {
        phone,
        name: (r['주문자 이름'] || '').trim(),
        email: (r['주문자 이메일'] || '').trim(),
      })
    }
  }

  // 고객 매칭: 3가지 방법
  // 1차: step 3에서 구축한 realPhoneToCustomerId (가장 정확)
  // 2차: name + phone_last4 매칭 (step 3 이후 DB 재조회)
  // 3차: kakao_friend_name 매칭

  // step 3 이후 DB 고객 다시 조회
  const currentCustomers = await fetchAllPaginated('customers', 'id, name, phone_last4, kakao_friend_name, email')
  console.log(`  DB 고객: ${currentCustomers.length}`)

  // name+phone_last4 → customer_id 매핑
  const nameL4ToId = new Map<string, string>()
  for (const c of currentCustomers) {
    if (c.name && c.phone_last4) {
      const key = `${c.name}|${c.phone_last4}`
      if (!nameL4ToId.has(key)) {
        nameL4ToId.set(key, c.id)
      }
    }
  }

  // kakao_friend_name → customer_id 매핑
  const kakaoToId = new Map<string, string>()
  for (const c of currentCustomers) {
    if (c.kakao_friend_name) {
      kakaoToId.set(c.kakao_friend_name, c.id)
    }
  }

  // Order CSV phone → customer_id 매핑
  const phoneToCustomerId = new Map<string, string>()
  const uniquePhones = Array.from(orderPhoneMap.keys())

  let matchedByRealPhone = 0
  let matchedByNameL4 = 0
  let matchedByKakao = 0
  let newCustomersNeeded = 0

  for (const phone of uniquePhones) {
    const info = orderPhoneMap.get(phone)!
    const last4 = phone.slice(-4)

    // 1차: step 3에서 구축한 실제전화→고객 매핑 (가장 정확)
    if (realPhoneToCustomerId.has(phone)) {
      phoneToCustomerId.set(phone, realPhoneToCustomerId.get(phone)!)
      matchedByRealPhone++
      continue
    }

    // 2차: name + phone_last4 매칭
    const nameKey = `${info.name}|${last4}`
    if (nameL4ToId.has(nameKey)) {
      phoneToCustomerId.set(phone, nameL4ToId.get(nameKey)!)
      matchedByNameL4++
      continue
    }

    // 3차: Dashboard CSV에서 이 전화번호의 카톡이름 → kakao_friend_name 매칭
    const kakaoName = phoneToKakaoName.get(phone)
    if (kakaoName && kakaoToId.has(kakaoName)) {
      phoneToCustomerId.set(phone, kakaoToId.get(kakaoName)!)
      matchedByKakao++
      continue
    }

    // 매칭 안됨 → 신규 고객 필요
    newCustomersNeeded++
  }

  console.log(`\n  고객 매칭 결과:`)
  console.log(`    실제전화 매칭: ${matchedByRealPhone}`)
  console.log(`    name+last4 매칭: ${matchedByNameL4}`)
  console.log(`    kakao_friend_name 매칭: ${matchedByKakao}`)
  console.log(`    신규 생성 필요: ${newCustomersNeeded}`)

  // 신규 고객 생성
  let customersCreated = 0
  if (!IS_DRY_RUN) {
    const unmatchedPhones = uniquePhones.filter(p => !phoneToCustomerId.has(p))
    for (let i = 0; i < unmatchedPhones.length; i += BATCH_SIZE) {
      const batch = unmatchedPhones.slice(i, i + BATCH_SIZE)
      const customerRows = batch.map(phone => {
        const info = orderPhoneMap.get(phone)!
        const last4 = phone.slice(-4)
        return {
          name: info.name,
          phone_last4: last4,
          kakao_friend_name: `${info.name}/${last4}`,
          email: info.email || null,
        }
      })
      const { data, error } = await retryAsync(() =>
        supabase.from('customers').insert(customerRows).select('id, name, phone_last4')
      )
      if (error) {
        console.error(`  고객 생성 에러:`, error.message)
      } else {
        data?.forEach((c, idx) => {
          if (idx < batch.length) phoneToCustomerId.set(batch[idx], c.id)
        })
        customersCreated += data?.length || 0
      }
    }
  } else {
    customersCreated = newCustomersNeeded
    for (const phone of uniquePhones) {
      if (!phoneToCustomerId.has(phone)) phoneToCustomerId.set(phone, 'mock')
    }
  }
  console.log(`  신규 고객 생성: ${customersCreated}`)

  // 이메일 업데이트 (기존 고객 중 이메일 없는 경우)
  let emailUpdated = 0
  if (!IS_DRY_RUN) {
    const emailUpdateMap = new Map<string, string>()
    for (const c of currentCustomers) {
      if (!c.email) emailUpdateMap.set(c.id, c.id)
    }
    for (const phone of uniquePhones) {
      const customerId = phoneToCustomerId.get(phone)
      if (!customerId || !emailUpdateMap.has(customerId)) continue
      const info = orderPhoneMap.get(phone)!
      if (!info.email) continue
      await supabase.from('customers').update({ email: info.email }).eq('id', customerId)
      emailUpdateMap.delete(customerId)  // 한번만 업데이트
      emailUpdated++
    }
    if (emailUpdated > 0) console.log(`  이메일 업데이트: ${emailUpdated}`)
  }

  // 주문 데이터 생성
  const orderMap = new Map<string, { orderNo: string; orderedAt: string; amount: number; phone: string }>()
  for (const r of realOrderRows) {
    const orderNo = (r['주문번호'] || '').trim()
    const phone = (r['주문자 번호'] || '').trim()
    if (!orderNo || !phone) continue
    if (!orderMap.has(orderNo)) {
      orderMap.set(orderNo, {
        orderNo,
        orderedAt: normalizeDate(r['주문일'] || '') || '',
        amount: parseAmount(r['최종주문금액']),
        phone,
      })
    }
  }

  const orderNos = Array.from(orderMap.keys())
  console.log(`\n  고유 주문: ${orderNos.length}`)

  let ordersCreated = 0
  let ordersErrors = 0
  let ordersSkipped = 0

  if (!IS_DRY_RUN) {
    for (let i = 0; i < orderNos.length; i += BATCH_SIZE) {
      const batch = orderNos.slice(i, i + BATCH_SIZE)
      const orderRows = batch
        .map(orderNo => {
          const info = orderMap.get(orderNo)!
          const customerId = phoneToCustomerId.get(info.phone)
          if (!customerId) {
            ordersSkipped++
            return null
          }
          return {
            imweb_order_no: orderNo,
            customer_id: customerId,
            total_amount: info.amount,
            ordered_at: info.orderedAt || null,
          }
        })
        .filter(Boolean) as any[]

      if (orderRows.length === 0) continue

      const { error } = await retryAsync(() =>
        supabase.from('orders').insert(orderRows)
      )
      if (error) {
        console.error(`  주문 생성 에러:`, error.message)
        ordersErrors += batch.length
      } else {
        ordersCreated += orderRows.length
      }

      if ((i + BATCH_SIZE) % 5000 < BATCH_SIZE) {
        console.log(`  진행: ${Math.min(i + BATCH_SIZE, orderNos.length)}/${orderNos.length}`)
      }
    }
  } else {
    ordersCreated = orderNos.length
  }

  // ═══════════════════════════════════════════════
  // 결과 요약
  // ═══════════════════════════════════════════════
  console.log('\n' + '='.repeat(50))
  console.log('Summary')
  console.log('='.repeat(50))
  console.log(`1단계: 주문/주문아이템 전체 삭제`)
  console.log(`2단계: 구독 없는 고객 ${orphanCustomers.length}명 삭제`)
  console.log(`3단계: 기존 고객 ${kakaoUpdated}명 kakao_friend_name 수정 (에러: ${kakaoErrors})`)
  console.log(`4단계: 주문 ${ordersCreated}건 생성 (에러: ${ordersErrors}, 스킵: ${ordersSkipped})`)
  console.log(`       신규 고객 ${customersCreated}명 생성, 이메일 ${emailUpdated}건 업데이트`)
  console.log(IS_DRY_RUN ? '\n[DRY-RUN] No changes made' : '\nDone!')
  console.log('='.repeat(50) + '\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
