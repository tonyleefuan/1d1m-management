/**
 * 상품 + 실시간 메시지 시드 데이터 생성 및 업로드 스크립트
 *
 * 사용법:
 *   npx tsx scripts/seed-data.ts <base_url> <admin_token>
 *
 * 또는 로컬:
 *   npx tsx scripts/seed-data.ts http://localhost:3000
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

const BASE_URL = process.argv[2] || 'http://localhost:3000'

// ─── 1. 상품 시드 데이터 ────────────────────────────

const REALTIME_SKUS = new Set(['SUB-45', 'SUB-46', 'SUB-60', 'SUB-63', 'SUB-64', 'SUB-95'])

function parseProducts() {
  const csvPath = path.join(__dirname, '../data/products.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('products.csv not found at', csvPath)
    process.exit(1)
  }

  const raw = fs.readFileSync(csvPath, 'utf-8')
  const rows = parse(raw, { columns: true, skip_empty_lines: true })

  return rows.map((row: any) => {
    const sku = row['Subject Code']?.trim()
    const title = row['Title']?.trim()
    const prices: { duration_days: number; price: number }[] = []

    const p90 = row['90']?.replace(/[₩,]/g, '').trim()
    const p180 = row['180']?.replace(/[₩,]/g, '').trim()
    const p365 = row['365']?.replace(/[₩,]/g, '').trim()

    if (p90 && parseInt(p90)) prices.push({ duration_days: 90, price: parseInt(p90) })
    if (p180 && parseInt(p180)) prices.push({ duration_days: 180, price: parseInt(p180) })
    if (p365 && parseInt(p365)) prices.push({ duration_days: 365, price: parseInt(p365) })

    return {
      sku_code: sku,
      title,
      message_type: REALTIME_SKUS.has(sku) ? 'realtime' as const : 'fixed' as const,
      prices,
    }
  }).filter((p: any) => p.sku_code && p.title)
}

// ─── 2. 실시간 메시지 히스토리 ──────────────────────

function parseDailyMessages() {
  const csvPath = path.join(__dirname, '../data/update.csv')
  if (!fs.existsSync(csvPath)) {
    console.error('update.csv not found at', csvPath)
    return []
  }

  const raw = fs.readFileSync(csvPath, 'utf-8')
  const rows = parse(raw, { columns: true, skip_empty_lines: true })

  const messages: { sku_code: string; send_date: string; content: string }[] = []

  for (const row of rows) {
    const sku = row['Subject Code']?.trim()
    if (!sku || !sku.startsWith('SUB-')) continue

    // 날짜 컬럼에서 메시지 추출 (최근 30일)
    const dateColumns = Object.keys(row).filter(k => k.match(/^\d{4}-\d{2}-\d{2}$/))
    let count = 0

    for (const date of dateColumns) {
      if (count >= 30) break
      const content = row[date]?.trim()
      if (content) {
        messages.push({ sku_code: sku, send_date: date, content })
        count++
      }
    }
  }

  return messages
}

// ─── Main ──────────────────────────────────────────

async function main() {
  // Login first
  console.log('🔐 Logging in...')
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin1234' }),
  })

  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text())
    process.exit(1)
  }

  const cookies = loginRes.headers.getSetCookie?.() || []
  const sessionCookie = cookies.find(c => c.startsWith('session='))
  if (!sessionCookie) {
    console.error('No session cookie received')
    process.exit(1)
  }
  const cookie = sessionCookie.split(';')[0]
  console.log('✅ Logged in')

  // Seed products
  const products = parseProducts()
  console.log(`\n📦 Seeding ${products.length} products...`)

  const prodRes = await fetch(`${BASE_URL}/api/seed/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ products }),
  })

  const prodResult = await prodRes.json()
  console.log('  Result:', prodResult)

  // Seed daily messages
  const messages = parseDailyMessages()
  if (messages.length > 0) {
    console.log(`\n💬 Seeding ${messages.length} daily messages...`)

    // Batch in chunks of 50
    for (let i = 0; i < messages.length; i += 50) {
      const chunk = messages.slice(i, i + 50)
      const msgRes = await fetch(`${BASE_URL}/api/seed/daily-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ messages: chunk }),
      })
      const msgResult = await msgRes.json()
      console.log(`  Batch ${Math.floor(i / 50) + 1}: created=${msgResult.created}, skipped=${msgResult.skipped}`)
    }
  }

  console.log('\n🎉 Done!')
}

main().catch(console.error)
