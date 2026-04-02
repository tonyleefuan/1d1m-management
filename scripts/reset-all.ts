/**
 * DB 전체 초기화 스크립트
 * subscriptions, order_items, orders, customers 전부 삭제
 *
 * 사용법: npx tsx scripts/reset-all.ts
 */

import path from 'path'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function main() {
  console.log('DB 전체 초기화 시작...\n')

  // FK 관계 순서: subscriptions → order_items → orders → customers
  const tables = ['subscriptions', 'order_items', 'orders', 'customers']

  for (const table of tables) {
    console.log(`${table} 삭제 중...`)
    const { error, count } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (error) {
      console.error(`  에러: ${error.message}`)
    } else {
      console.log(`  완료`)
    }
  }

  // 확인
  console.log('\n검증:')
  for (const table of tables) {
    const { count } = await supabase.from(table).select('id', { count: 'exact', head: true })
    console.log(`  ${table}: ${count}건`)
  }

  console.log('\n초기화 완료!')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
