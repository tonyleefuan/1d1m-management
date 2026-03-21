/**
 * 고정 메시지 일괄 등록 스크립트
 * npx tsx scripts/seed-messages.ts <base_url>
 */

import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'

const BASE_URL = process.argv[2] || 'https://1d1m-management.vercel.app'
const CSV_PATH = path.join(__dirname, '../data/messages.csv')

interface MessageRow {
  sku_code: string
  day_number: number
  sort_order: number
  content: string
  image_path?: string
}

function parseMessages(): MessageRow[] {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8')
  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true })

  const messages: MessageRow[] = []

  for (const row of rows) {
    const msgCode = (row['Message Code'] || '').trim()
    const msg = (row['Message'] || '').trim()
    const filePath = (row['File'] || '').trim()

    if (!msgCode || !msg) continue

    // Parse: SUB-1_D1_1 → sku=SUB-1, day=1, sort_order=1
    const match = msgCode.match(/^(SUB-\d+)_D(\d+)_(\d+)$/)
    if (!match) continue

    messages.push({
      sku_code: match[1],
      day_number: parseInt(match[2]),
      sort_order: parseInt(match[3]),
      content: msg,
      image_path: filePath && filePath !== '#N/A' ? filePath : undefined,
    })
  }

  return messages
}

async function main() {
  // Login
  console.log('🔐 Logging in...')
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin1234' }),
  })
  if (!loginRes.ok) { console.error('Login failed'); process.exit(1) }
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0]
  console.log('✅ Logged in')

  // Parse
  const messages = parseMessages()
  console.log(`\n📝 Parsed ${messages.length} day messages from CSV`)

  // Upload in batches of 200
  const BATCH = 200
  let totalCreated = 0
  const errorSkus = new Set<string>()

  for (let i = 0; i < messages.length; i += BATCH) {
    const chunk = messages.slice(i, i + BATCH)
    const res = await fetch(`${BASE_URL}/api/seed/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ messages: chunk }),
    })

    if (!res.ok) {
      console.error(`  Batch ${Math.floor(i / BATCH) + 1} FAILED:`, await res.text())
      continue
    }

    const result = await res.json()
    totalCreated += result.created || 0
    result.error_skus?.forEach((s: string) => errorSkus.add(s))

    const batchNum = Math.floor(i / BATCH) + 1
    const totalBatches = Math.ceil(messages.length / BATCH)
    console.log(`  Batch ${batchNum}/${totalBatches}: ${result.created} created`)
  }

  console.log(`\n✅ Total created: ${totalCreated}`)
  if (errorSkus.size > 0) {
    console.log(`⚠️  Unknown SKUs (not in products table): ${[...errorSkus].join(', ')}`)
  }
  console.log('🎉 Done!')
}

main().catch(console.error)
