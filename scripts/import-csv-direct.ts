/**
 * Direct CSV import script — bypasses web API
 * Usage: npx tsx scripts/import-csv-direct.ts <csv_path> [--dry-run]
 */
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const BATCH = 500
const REFERENCE_DATE = '2026-04-04'
const DAY_INTERPRETATION = 'already_sent' // CSV Day = already sent

function diffDays(a: string, b: string): number {
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

function parseDateKST(value: unknown): string {
  if (!value) return ''
  const s = String(value).trim()
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 30000) {
    const d = new Date((Number(s) - 25569) * 86400000)
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d)
  }
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return s
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (!value) return 0
  return Number(String(value).replace(/,/g, '')) || 0
}

function parseStatus(s: string): string {
  const v = s?.trim().toLowerCase()
  if (['live', 'pending', 'pause', 'archive', 'cancel'].includes(v)) return v
  return 'live'
}

async function main() {
  const csvPath = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-csv-direct.ts <csv_path> [--dry-run]')
    process.exit(1)
  }

  console.log(`📂 Reading ${csvPath}...`)
  const wb = XLSX.readFile(csvPath, { codepage: 65001 })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]
  console.log(`📊 ${rows.length} rows`)

  // Load reference tables
  console.log('📦 Loading products, devices...')
  const [productsRes, devicesRes] = await Promise.all([
    supabase.from('products').select('id, sku_code'),
    supabase.from('send_devices').select('id, phone_number'),
  ])
  const productMap = new Map(productsRes.data?.map(p => [p.sku_code, p.id]) || [])
  const deviceMap = new Map(devicesRes.data?.map(d => [d.phone_number, d.id]) || [])
  console.log(`  Products: ${productMap.size}, Devices: ${deviceMap.size}`)

  // Day offset
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const dayOffset = diffDays(today, REFERENCE_DATE)
  console.log(`📅 Today: ${today}, Reference: ${REFERENCE_DATE}, Offset: ${dayOffset}`)

  // Parse rows
  interface ParsedRow {
    kakao: string
    sku: string
    pcPhone: string
    orderNo: string
    status: string
    startDate: string
    endDate: string
    durationDays: number
    lastSentDay: number
    productId: string
    deviceId: string
  }

  const parsed: ParsedRow[] = []
  const seenPairs = new Set<string>()
  let skippedSku = 0, skippedPc = 0, skippedDup = 0, skippedEmpty = 0

  for (const raw of rows) {
    const sku = String(raw['SKU'] || '').trim()
    const pcPhone = String(raw['PC 번호'] || '').trim()
    const kakao = String(raw['카톡이름'] || '').trim()
    const orderNo = String(raw['주문번호'] || '').trim()

    if (!sku && !pcPhone && !kakao) { skippedEmpty++; continue }

    const productId = productMap.get(sku)
    if (!productId) { skippedSku++; continue }

    const deviceId = deviceMap.get(pcPhone)
    if (!deviceId) { skippedPc++; continue }

    const pairKey = `${kakao}::${sku}`
    if (seenPairs.has(pairKey)) { skippedDup++; continue }
    seenPairs.add(pairKey)

    const csvDay = parseNumber(raw['Day'])
    const durationDays = parseNumber(raw['기간'])
    let lastSentDay = DAY_INTERPRETATION === 'already_sent' ? csvDay + dayOffset : csvDay + dayOffset - 1
    lastSentDay = Math.max(0, lastSentDay)
    if (durationDays > 0) lastSentDay = Math.min(lastSentDay, durationDays)

    parsed.push({
      kakao, sku, pcPhone, orderNo,
      status: parseStatus(String(raw['상태'] || '')),
      startDate: parseDateKST(raw['시작일']),
      endDate: parseDateKST(raw['종료일']),
      durationDays, lastSentDay, productId, deviceId,
    })
  }

  console.log(`\n✅ Valid: ${parsed.length}`)
  console.log(`⏭ Skipped — SKU: ${skippedSku}, PC: ${skippedPc}, Dup: ${skippedDup}, Empty: ${skippedEmpty}`)

  if (dryRun) {
    console.log('\n🏁 Dry run — no DB changes')
    return
  }

  // 1. Upsert customers
  console.log('\n👤 Creating customers...')
  const uniqueKakao = [...new Set(parsed.map(r => r.kakao))]
  const customerMap = new Map<string, string>()

  // Load existing
  for (let i = 0; i < uniqueKakao.length; i += 300) {
    const chunk = uniqueKakao.slice(i, i + 300)
    const { data } = await supabase.from('customers').select('id, kakao_friend_name').in('kakao_friend_name', chunk)
    data?.forEach(c => customerMap.set(c.kakao_friend_name, c.id))
  }
  console.log(`  Existing: ${customerMap.size}`)

  // Create new
  const newKakao = uniqueKakao.filter(k => !customerMap.has(k))
  console.log(`  New: ${newKakao.length}`)
  for (let i = 0; i < newKakao.length; i += BATCH) {
    const batch = newKakao.slice(i, i + BATCH).map(k => {
      const parts = k.split('/')
      return { name: parts[0] || k, phone_last4: parts[1] || null, kakao_friend_name: k }
    })
    const { data, error } = await supabase.from('customers').insert(batch).select('id, kakao_friend_name')
    if (error) {
      console.error(`  ❌ Customer batch error:`, error.message)
      // One by one fallback
      for (const c of batch) {
        const { data: d, error: e } = await supabase.from('customers').insert(c).select('id, kakao_friend_name')
        if (d?.[0]) customerMap.set(d[0].kakao_friend_name, d[0].id)
        else if (e) {
          // Try to fetch existing (might have been created by another batch)
          const { data: existing } = await supabase.from('customers').select('id').eq('kakao_friend_name', c.kakao_friend_name).single()
          if (existing) customerMap.set(c.kakao_friend_name!, existing.id)
        }
      }
    } else {
      data?.forEach(c => customerMap.set(c.kakao_friend_name, c.id))
    }
    if ((i / BATCH) % 10 === 0) process.stdout.write(`  ${i + batch.length}/${newKakao.length}\r`)
  }
  console.log(`  Total customers: ${customerMap.size}`)

  // 2. Create orders
  console.log('\n📦 Creating orders...')
  const orderGroups = new Map<string, ParsedRow>()
  for (const r of parsed) {
    if (r.orderNo && !orderGroups.has(r.orderNo)) orderGroups.set(r.orderNo, r)
  }

  const orderNos = [...orderGroups.keys()]
  for (let i = 0; i < orderNos.length; i += BATCH) {
    const batch = orderNos.slice(i, i + BATCH).map(no => {
      const r = orderGroups.get(no)!
      const customerId = customerMap.get(r.kakao)
      return {
        imweb_order_no: no,
        customer_id: customerId,
        total_amount: 0,
        ordered_at: r.startDate || today,
      }
    }).filter(o => o.customer_id)
    if (batch.length > 0) {
      await supabase.from('orders').upsert(batch, { onConflict: 'imweb_order_no', ignoreDuplicates: true })
    }
  }
  console.log(`  Orders: ${orderGroups.size}`)

  // Get order IDs
  const orderNoToId = new Map<string, string>()
  for (let i = 0; i < orderNos.length; i += 300) {
    const chunk = orderNos.slice(i, i + 300)
    const { data } = await supabase.from('orders').select('id, imweb_order_no').in('imweb_order_no', chunk)
    data?.forEach(o => orderNoToId.set(o.imweb_order_no, o.id))
  }

  // 3. Create order_items
  console.log('\n📋 Creating order items...')
  const itemRows = parsed.filter(r => r.orderNo && orderNoToId.has(r.orderNo)).map(r => ({
    order_id: orderNoToId.get(r.orderNo)!,
    imweb_item_no: `csv_${r.orderNo}_${r.sku}`,
    product_id: r.productId,
    duration_days: r.durationDays,
    list_price: 0,
    allocated_amount: 0,
  }))

  // Dedup by imweb_item_no
  const seenItems = new Set<string>()
  const dedupItems = itemRows.filter(r => {
    if (seenItems.has(r.imweb_item_no)) return false
    seenItems.add(r.imweb_item_no)
    return true
  })

  for (let i = 0; i < dedupItems.length; i += BATCH) {
    const batch = dedupItems.slice(i, i + BATCH)
    await supabase.from('order_items').upsert(batch, { onConflict: 'imweb_item_no', ignoreDuplicates: true })
  }

  // Get item IDs
  const itemMap = new Map<string, string>()
  const allItemNos = dedupItems.map(r => r.imweb_item_no)
  for (let i = 0; i < allItemNos.length; i += 300) {
    const chunk = allItemNos.slice(i, i + 300)
    const { data } = await supabase.from('order_items').select('id, imweb_item_no').in('imweb_item_no', chunk)
    data?.forEach(oi => itemMap.set(oi.imweb_item_no, oi.id))
  }
  console.log(`  Order items: ${itemMap.size}`)

  // 4. Insert subscriptions
  console.log('\n📌 Creating subscriptions...')
  let created = 0, errors = 0

  for (let i = 0; i < parsed.length; i += BATCH) {
    const batch = parsed.slice(i, i + BATCH)
      .map(r => {
        const customerId = customerMap.get(r.kakao)
        if (!customerId) return null
        const itemKey = `csv_${r.orderNo}_${r.sku}`
        return {
          customer_id: customerId,
          product_id: r.productId,
          device_id: r.deviceId,
          order_item_id: itemMap.get(itemKey) || null,
          status: r.status,
          start_date: r.startDate || null,
          end_date: r.endDate || null,
          duration_days: r.durationDays,
          last_sent_day: r.lastSentDay,
          paused_days: 0,
          is_cancelled: r.status === 'cancel',
        }
      })
      .filter(Boolean)

    const { error } = await supabase.from('subscriptions').insert(batch)
    if (error) {
      console.error(`  ❌ Batch ${i} error:`, error.message)
      // One by one
      for (const row of batch) {
        const { error: e } = await supabase.from('subscriptions').insert(row)
        if (e) errors++
        else created++
      }
    } else {
      created += batch.length
    }
    if ((i / BATCH) % 5 === 0) process.stdout.write(`  ${Math.min(i + BATCH, parsed.length)}/${parsed.length}\r`)
  }

  console.log(`\n\n🎉 Done!`)
  console.log(`  Created: ${created}`)
  console.log(`  Errors: ${errors}`)
  console.log(`  Customers: ${customerMap.size}`)
  console.log(`  Orders: ${orderNoToId.size}`)
  console.log(`  Order items: ${itemMap.size}`)
}

main().catch(console.error)
