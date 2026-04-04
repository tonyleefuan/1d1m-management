/**
 * Final import script — Dashboard CSV + Order CSV
 *
 * Dashboard CSV: PC번호, 카톡이름, 시작일, 종료일, 상태, Day, D-Day, SKU, 기간, 주문번호
 * Order CSV: 카톡이름, 주문번호, 주문섹션품목번호
 *
 * Day = 오늘 발송할 Day → last_sent_day = Day - 1
 */
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BATCH = 500

function parseDateKST(value: unknown): string {
  if (!value) return ''
  const s = String(value).trim()
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 30000) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
      new Date((Number(s) - 25569) * 86400000)
    )
  }
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return s
}

function parseNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (!v) return 0
  return Number(String(v).replace(/,/g, '')) || 0
}

function parseStatus(s: string): string {
  const v = s?.trim().toLowerCase()
  if (['live', 'pending', 'pause', 'archive', 'cancel'].includes(v)) return v
  return 'live'
}

async function main() {
  const dashPath = process.argv[2]
  const orderPath = process.argv[3]
  const dryRun = process.argv.includes('--dry-run')

  if (!dashPath || !orderPath) {
    console.error('Usage: npx tsx scripts/import-final.ts <dashboard.csv> <order.csv> [--dry-run]')
    process.exit(1)
  }

  // 1. Read CSVs
  console.log('📂 Reading CSVs...')
  const dashRows = XLSX.utils.sheet_to_json(
    XLSX.read(require('fs').readFileSync(dashPath), { codepage: 65001 }).Sheets['Sheet1'] ||
    XLSX.read(require('fs').readFileSync(dashPath), { codepage: 65001 }).Sheets[
      XLSX.read(require('fs').readFileSync(dashPath), { codepage: 65001 }).SheetNames[0]
    ]
  ) as Record<string, unknown>[]

  const orderWb = XLSX.read(require('fs').readFileSync(orderPath), { codepage: 65001 })
  const orderRows = XLSX.utils.sheet_to_json(orderWb.Sheets[orderWb.SheetNames[0]]) as Record<string, unknown>[]

  console.log(`  Dashboard: ${dashRows.length} rows`)
  console.log(`  Orders: ${orderRows.length} rows`)

  // 2. Build order lookup: 카톡이름 → [{주문번호, 주문섹션품목번호}]
  const orderByKakao = new Map<string, { orderNo: string; itemNo: string }[]>()
  for (const row of orderRows) {
    const kakao = String(row['카톡이름'] || '').trim()
    const orderNo = String(row['주문번호'] || '').trim()
    const itemNo = String(row['주문섹션품목번호'] || '').trim()
    if (!kakao || !orderNo) continue
    const list = orderByKakao.get(kakao) || []
    list.push({ orderNo, itemNo })
    orderByKakao.set(kakao, list)
  }
  console.log(`  Order lookup: ${orderByKakao.size} unique kakao names`)

  // 3. Load products & devices
  console.log('\n📦 Loading products, devices...')
  const [productsRes, devicesRes] = await Promise.all([
    supabase.from('products').select('id, sku_code'),
    supabase.from('send_devices').select('id, phone_number'),
  ])
  const productMap = new Map(productsRes.data?.map(p => [p.sku_code, p.id]) || [])
  const deviceMap = new Map(devicesRes.data?.map(d => [d.phone_number, d.id]) || [])
  console.log(`  Products: ${productMap.size}, Devices: ${deviceMap.size}`)

  // 4. Parse dashboard rows
  interface Row {
    kakao: string; sku: string; pcPhone: string
    status: string; startDate: string; endDate: string
    durationDays: number; lastSentDay: number
    productId: string; deviceId: string
    dashOrderNo: string // from dashboard CSV
  }

  const parsed: Row[] = []
  const seenPairs = new Set<string>()
  let skipSku = 0, skipPc = 0, skipDup = 0

  for (const raw of dashRows) {
    const sku = String(raw['SKU'] || '').trim()
    const pcPhone = String(raw['PC 번호'] || '').trim()
    const kakao = String(raw['카톡이름'] || '').trim()
    const dashOrderNo = String(raw['주문번호'] || '').trim()

    if (!sku && !pcPhone && !kakao) continue

    const productId = productMap.get(sku)
    if (!productId) { skipSku++; continue }
    const deviceId = deviceMap.get(pcPhone)
    if (!deviceId) { skipPc++; continue }

    const pairKey = `${kakao}::${sku}`
    if (seenPairs.has(pairKey)) { skipDup++; continue }
    seenPairs.add(pairKey)

    const day = parseNumber(raw['Day'])
    // Day = 오늘 발송할 Day → last_sent_day = Day - 1
    const lastSentDay = Math.max(0, day - 1)

    parsed.push({
      kakao, sku, pcPhone, dashOrderNo,
      status: parseStatus(String(raw['상태'] || '')),
      startDate: parseDateKST(raw['시작일']),
      endDate: parseDateKST(raw['종료일']),
      durationDays: parseNumber(raw['기간']),
      lastSentDay, productId, deviceId,
    })
  }

  console.log(`\n✅ Valid: ${parsed.length}`)
  console.log(`⏭ Skip — SKU: ${skipSku}, PC: ${skipPc}, Dup: ${skipDup}`)

  if (dryRun) { console.log('\n🏁 Dry run'); return }

  // 5. Create customers
  console.log('\n👤 Creating customers...')
  const uniqueKakao = [...new Set(parsed.map(r => r.kakao))]
  const customerMap = new Map<string, string>()

  for (let i = 0; i < uniqueKakao.length; i += 300) {
    const chunk = uniqueKakao.slice(i, i + 300)
    const { data } = await supabase.from('customers').select('id, kakao_friend_name').in('kakao_friend_name', chunk)
    data?.forEach(c => customerMap.set(c.kakao_friend_name, c.id))
  }

  const newKakao = uniqueKakao.filter(k => !customerMap.has(k))
  for (let i = 0; i < newKakao.length; i += BATCH) {
    const batch = newKakao.slice(i, i + BATCH).map(k => {
      const parts = k.split('/')
      return { name: parts[0] || k, phone_last4: parts[1] || null, kakao_friend_name: k }
    })
    const { data, error } = await supabase.from('customers').insert(batch).select('id, kakao_friend_name')
    if (error) {
      // one by one fallback
      for (const c of batch) {
        const { data: d } = await supabase.from('customers').insert(c).select('id, kakao_friend_name')
        if (d?.[0]) customerMap.set(d[0].kakao_friend_name, d[0].id)
        else {
          const { data: ex } = await supabase.from('customers').select('id').eq('kakao_friend_name', c.kakao_friend_name!).single()
          if (ex) customerMap.set(c.kakao_friend_name!, ex.id)
        }
      }
    } else {
      data?.forEach(c => customerMap.set(c.kakao_friend_name, c.id))
    }
  }
  console.log(`  Customers: ${customerMap.size}`)

  // 6. Create orders from Order CSV
  console.log('\n📦 Creating orders...')
  const allOrderNos = new Set<string>()
  const orderItemRows: { orderNo: string; itemNo: string; kakao: string }[] = []

  for (const row of orderRows) {
    const kakao = String(row['카톡이름'] || '').trim()
    const orderNo = String(row['주문번호'] || '').trim()
    const itemNo = String(row['주문섹션품목번호'] || '').trim()
    if (!kakao || !orderNo) continue
    const customerId = customerMap.get(kakao)
    if (!customerId) continue
    allOrderNos.add(orderNo)
    orderItemRows.push({ orderNo, itemNo, kakao })
  }

  // Upsert orders
  const orderBatch = [...allOrderNos].map(no => {
    // Find first kakao for this order to get customer_id
    const row = orderItemRows.find(r => r.orderNo === no)
    const customerId = row ? customerMap.get(row.kakao) : null
    return { imweb_order_no: no, customer_id: customerId, total_amount: 0, ordered_at: '2026-04-05' }
  }).filter(o => o.customer_id)

  for (let i = 0; i < orderBatch.length; i += BATCH) {
    await supabase.from('orders').upsert(orderBatch.slice(i, i + BATCH), { onConflict: 'imweb_order_no', ignoreDuplicates: true })
  }

  // Get order IDs
  const orderNoToId = new Map<string, string>()
  const orderNosArr = [...allOrderNos]
  for (let i = 0; i < orderNosArr.length; i += 300) {
    const { data } = await supabase.from('orders').select('id, imweb_order_no').in('imweb_order_no', orderNosArr.slice(i, i + 300))
    data?.forEach(o => orderNoToId.set(o.imweb_order_no, o.id))
  }
  console.log(`  Orders: ${orderNoToId.size}`)

  // 7. Create order_items from Order CSV
  console.log('\n📋 Creating order items...')
  const seenItemNos = new Set<string>()
  const itemBatch: any[] = []

  for (const row of orderItemRows) {
    if (!row.itemNo || seenItemNos.has(row.itemNo)) continue
    const orderId = orderNoToId.get(row.orderNo)
    if (!orderId) continue
    seenItemNos.add(row.itemNo)
    itemBatch.push({
      order_id: orderId,
      imweb_item_no: row.itemNo,
      product_id: null, // will be linked via subscription
      duration_days: 0,
      list_price: 0,
      allocated_amount: 0,
    })
  }

  for (let i = 0; i < itemBatch.length; i += BATCH) {
    await supabase.from('order_items').upsert(itemBatch.slice(i, i + BATCH), { onConflict: 'imweb_item_no', ignoreDuplicates: true })
  }

  // Get item IDs
  const itemNoToId = new Map<string, string>()
  const allItemNos = [...seenItemNos]
  for (let i = 0; i < allItemNos.length; i += 300) {
    const { data } = await supabase.from('order_items').select('id, imweb_item_no').in('imweb_item_no', allItemNos.slice(i, i + 300))
    data?.forEach(oi => itemNoToId.set(oi.imweb_item_no, oi.id))
  }
  console.log(`  Order items: ${itemNoToId.size}`)

  // 8. Build kakao+sku → order_item_id mapping
  // For each dashboard row, find matching order item via kakao name
  const kakaoToOrderItems = new Map<string, Map<string, string>>() // kakao → (orderNo → first itemId)
  for (const row of orderItemRows) {
    const itemId = itemNoToId.get(row.itemNo)
    if (!itemId) continue
    if (!kakaoToOrderItems.has(row.kakao)) kakaoToOrderItems.set(row.kakao, new Map())
    const m = kakaoToOrderItems.get(row.kakao)!
    if (!m.has(row.orderNo)) m.set(row.orderNo, itemId)
  }

  // 9. Insert subscriptions
  console.log('\n📌 Creating subscriptions...')
  let created = 0, errors = 0, skippedCustomer = 0

  for (let i = 0; i < parsed.length; i += BATCH) {
    const batch = parsed.slice(i, i + BATCH).map(r => {
      const customerId = customerMap.get(r.kakao)
      if (!customerId) { skippedCustomer++; return null }

      // Try to find order_item_id: dashboard orderNo → order items for this kakao
      let orderItemId: string | null = null
      const kakaoOrders = kakaoToOrderItems.get(r.kakao)
      if (kakaoOrders && r.dashOrderNo) {
        orderItemId = kakaoOrders.get(r.dashOrderNo) || null
      }

      return {
        customer_id: customerId,
        product_id: r.productId,
        device_id: r.deviceId,
        order_item_id: orderItemId,
        status: r.status,
        start_date: r.startDate || null,
        end_date: r.endDate || null,
        duration_days: r.durationDays,
        last_sent_day: r.lastSentDay,
        paused_days: 0,
        is_cancelled: r.status === 'cancel',
      }
    }).filter(Boolean)

    const { error } = await supabase.from('subscriptions').insert(batch)
    if (error) {
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
  console.log(`  Subscriptions: ${created} created, ${errors} errors, ${skippedCustomer} skipped`)
  console.log(`  Customers: ${customerMap.size}`)
  console.log(`  Orders: ${orderNoToId.size}`)
  console.log(`  Order items: ${itemNoToId.size}`)
}

main().catch(console.error)
