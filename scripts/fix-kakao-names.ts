/**
 * 기존 고객의 kakao_friend_name 수정 스크립트
 *
 * 2가지 케이스 처리:
 * A) DB phone이 전화번호인 경우 → CSV G열로 매칭 → F열(카톡이름)로 업데이트
 * B) DB phone이 이미 카톡이름(이름/뒷4자리)인 경우 → phone 값을 kakao_friend_name으로 복사
 *
 * 공통: phone → null, phone_last4 설정
 *
 * 사용법:
 *   npx tsx scripts/fix-kakao-names.ts <csv_path> [--dry-run]
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

if (!CSV_PATH) {
  console.error('Usage: npx tsx scripts/fix-kakao-names.ts <csv_path> [--dry-run]')
  process.exit(1)
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const PAGE_SIZE = 1000

function isPhoneNumber(val: string): boolean {
  return /^01\d-\d{3,4}-\d{4}$/.test(val)
}

function isKakaoName(val: string): boolean {
  return val.includes('/')
}

async function fetchAllCustomersWithPhone() {
  const all: any[] = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('id, phone, kakao_friend_name, phone_last4')
      .not('phone', 'is', null)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) {
      console.error('DB error:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) break
    all.push(...data)
    page++
  }
  return all
}

async function main() {
  if (IS_DRY_RUN) console.log('[DRY-RUN]\n')

  // 1. CSV 읽기
  const raw = fs.readFileSync(CSV_PATH, 'utf-8')
  const rows: any[] = parse(raw, {
    columns: true, skip_empty_lines: true,
    quote: '"', escape: '"', relax_column_count: true, trim: true,
  })
  console.log(`CSV rows: ${rows.length}`)

  // G열(주문자 번호=전화번호) → F열(Mobile=카톡이름) 매핑
  const phoneToKakao = new Map<string, string>()
  for (const r of rows) {
    const phone = (r['주문자 번호'] || '').trim()
    const kakao = (r['Mobile'] || '').trim()
    if (phone && kakao && !phoneToKakao.has(phone)) {
      phoneToKakao.set(phone, kakao)
    }
  }
  console.log(`CSV G열→F열 mappings: ${phoneToKakao.size}`)

  // 2. DB에서 phone 있는 고객 전체 조회
  console.log('\nFetching customers from DB...')
  const customers = await fetchAllCustomersWithPhone()
  console.log(`Customers with phone in DB: ${customers.length}`)

  // 3. DB phone 패턴 분석
  let phoneIsNumber = 0
  let phoneIsKakao = 0
  let phoneIsOther = 0
  for (const c of customers) {
    if (isPhoneNumber(c.phone)) phoneIsNumber++
    else if (isKakaoName(c.phone)) phoneIsKakao++
    else phoneIsOther++
  }
  console.log(`\nDB phone patterns:`)
  console.log(`  전화번호: ${phoneIsNumber}`)
  console.log(`  카톡이름(이름/뒷4자리): ${phoneIsKakao}`)
  console.log(`  기타: ${phoneIsOther}`)

  // 4. 업데이트 대상 결정
  const updates: Array<{
    id: string
    kakao_friend_name: string
    phone_last4: string
    case_type: string
    old_kakao: string
  }> = []

  for (const c of customers) {
    const dbPhone = c.phone

    if (isPhoneNumber(dbPhone)) {
      // Case A: DB phone이 전화번호 → CSV G열로 매칭
      const kakao = phoneToKakao.get(dbPhone)
      if (kakao) {
        updates.push({
          id: c.id,
          kakao_friend_name: kakao,
          phone_last4: dbPhone.slice(-4),
          case_type: 'A(CSV매칭)',
          old_kakao: c.kakao_friend_name || '(null)',
        })
      } else {
        // CSV에 없는 전화번호 → 이름/뒷4자리로 만듦 (이름은 DB에서 별도 조회 필요하나 여기선 skip)
        // phone_last4만이라도 설정
        updates.push({
          id: c.id,
          kakao_friend_name: c.kakao_friend_name || dbPhone, // 기존 값 유지
          phone_last4: dbPhone.slice(-4),
          case_type: 'A(CSV없음)',
          old_kakao: c.kakao_friend_name || '(null)',
        })
      }
    } else if (isKakaoName(dbPhone)) {
      // Case B: DB phone이 이미 카톡이름 → 그대로 kakao_friend_name으로 복사
      const last4 = dbPhone.split('/').pop() || dbPhone.slice(-4)
      updates.push({
        id: c.id,
        kakao_friend_name: dbPhone,
        phone_last4: last4,
        case_type: 'B(이미카톡)',
        old_kakao: c.kakao_friend_name || '(null)',
      })
    } else {
      // 기타
      updates.push({
        id: c.id,
        kakao_friend_name: c.kakao_friend_name || dbPhone,
        phone_last4: dbPhone.slice(-4),
        case_type: 'C(기타)',
        old_kakao: c.kakao_friend_name || '(null)',
      })
    }
  }

  // 실제 변경이 필요한 것만 필터
  const realUpdates = updates.filter(u =>
    u.kakao_friend_name !== u.old_kakao || true  // phone→null도 해야 하므로 전부 업데이트
  )

  console.log(`\nTotal updates: ${realUpdates.length}`)
  // Case별 통계
  const caseStats = new Map<string, number>()
  for (const u of realUpdates) {
    caseStats.set(u.case_type, (caseStats.get(u.case_type) || 0) + 1)
  }
  for (const [k, v] of caseStats) {
    console.log(`  ${k}: ${v}`)
  }

  // 샘플 출력
  console.log('\nSample changes:')
  const caseTypes = Array.from(caseStats.keys())
  for (const ct of caseTypes) {
    const sample = realUpdates.find(u => u.case_type === ct)
    if (sample) {
      console.log(`  [${ct}] kakao: "${sample.old_kakao}" → "${sample.kakao_friend_name}"`)
    }
  }

  // 5. 업데이트 실행
  if (!IS_DRY_RUN && realUpdates.length > 0) {
    console.log(`\nUpdating ${realUpdates.length} customers...`)
    let success = 0
    let errors = 0

    for (let i = 0; i < realUpdates.length; i++) {
      const u = realUpdates[i]
      const { error: updateErr } = await supabase
        .from('customers')
        .update({
          kakao_friend_name: u.kakao_friend_name,
          phone_last4: u.phone_last4,
          phone: null,
        })
        .eq('id', u.id)

      if (updateErr) {
        errors++
        if (errors <= 5) console.error(`  Error:`, updateErr.message)
      } else {
        success++
      }

      if ((i + 1) % 1000 === 0) {
        console.log(`  Progress: ${i + 1}/${realUpdates.length}`)
      }
    }

    console.log(`\nDone: ${success} updated, ${errors} errors`)
  } else if (IS_DRY_RUN) {
    console.log(`\n[DRY-RUN] Would update ${realUpdates.length} customers (phone→null, kakao_friend_name fix)`)
  } else {
    console.log('\nNothing to update')
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
