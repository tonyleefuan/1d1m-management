import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import * as XLSX from 'xlsx'

const BATCH_SIZE = 500

// ─── Reuse column matching logic from ../route.ts ────────

const COLUMN_ALIASES: Record<string, string[]> = {
  pc: ['pc번호', 'pc 번호', 'pc', 'device', '디바이스', '발송번호', 'send number', '발송 번호'],
  kakao: ['카톡이름', '카톡 이름', '카카오이름', '카카오 이름', '카톡명', '친구이름', '친구 이름', 'kakao', 'kakao name'],
  startDate: ['시작일', '시작 일', 'start date', 'start_date', 'startdate', '구독시작일', '구독 시작일'],
  endDate: ['종료일', '종료 일', 'end date', 'end_date', 'enddate', '구독종료일', '구독 종료일', 'last date'],
  status: ['상태', '상품', 'status', 'product status', '구독상태', '구독 상태'],
  day: ['day', '일차', 'days'],
  sku: ['sku', '상품코드', '상품 코드', 'product code', 'sku code', 'sku_code'],
  duration: ['기간', '구독기간', '구독 기간', 'duration', 'days', 'total days', 'total_days'],
  orderNo: ['주문번호', '주문 번호', 'order number', 'order_no', 'order no', '주문섹션품목번호'],
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, ' ')
}

function buildColumnMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const header of headers) {
    const norm = normalizeHeader(header)
    for (const [fieldKey, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (map.has(fieldKey)) continue
      if (aliases.some(a => normalizeHeader(a) === norm)) {
        map.set(fieldKey, header)
        break
      }
    }
  }
  return map
}

function getField(row: Record<string, unknown>, colMap: Map<string, string>, fieldKey: string): unknown {
  const header = colMap.get(fieldKey)
  return header ? row[header] : undefined
}

function parseDate(value: unknown): string {
  if (!value) return ''
  const s = String(value).trim()
  if (/^\d{5}$/.test(s)) {
    const date = new Date((Number(s) - 25569) * 86400000)
    return date.toISOString().slice(0, 10)
  }
  // Handle Excel serial date with decimals (e.g. 46138.375)
  if (/^\d+\.\d+$/.test(s)) {
    const date = new Date((Number(s) - 25569) * 86400000)
    return date.toISOString().slice(0, 10)
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

function parseStatus(value: string): 'live' | 'pending' | 'pause' | 'archive' | 'cancel' {
  const s = value?.trim().toLowerCase()
  if (s === 'live') return 'live'
  if (s === 'pending') return 'pending'
  if (s === 'pause') return 'pause'
  if (s === 'archive') return 'archive'
  if (s === 'cancel') return 'cancel'
  return 'live'
}

function diffDays(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / msPerDay)
}

// ─── POST handler ────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const dayInterpretation = formData.get('dayInterpretation') as string || 'already_sent'
    const referenceDate = formData.get('referenceDate') as string || '2026-04-04'

    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })

    // 1. Parse CSV
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001 })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]

    if (rawRows.length === 0) {
      return NextResponse.json({ error: '데이터가 없습니다' }, { status: 400 })
    }

    const headers = Object.keys(rawRows[0])
    const colMap = buildColumnMap(headers)

    // 2. Load reference tables
    const [productsRes, devicesRes, customersRes, orderItemsRes] = await Promise.all([
      supabase.from('products').select('id, sku_code'),
      supabase.from('send_devices').select('id, phone_number'),
      supabase.from('customers').select('id, kakao_friend_name'),
      supabase.from('order_items').select('id, imweb_item_no, order:orders(imweb_order_no, customer_id)'),
    ])

    const productMap = new Map<string, string>()
    productsRes.data?.forEach(p => productMap.set(p.sku_code, p.id))

    const deviceMap = new Map<string, string>()
    devicesRes.data?.forEach(d => deviceMap.set(d.phone_number, d.id))

    const customerMap = new Map<string, string>()
    customersRes.data?.forEach(c => {
      if (c.kakao_friend_name && !customerMap.has(c.kakao_friend_name)) {
        customerMap.set(c.kakao_friend_name, c.id)
      }
    })

    const orderItemMap = new Map<string, string>()
    const orderCustomerMap = new Map<string, string>()
    orderItemsRes.data?.forEach((oi: any) => {
      const orderNo = oi.order?.imweb_order_no
      if (orderNo && oi.id && !orderItemMap.has(orderNo)) {
        orderItemMap.set(orderNo, oi.id)
      }
      if (orderNo && oi.order?.customer_id && !orderCustomerMap.has(orderNo)) {
        orderCustomerMap.set(orderNo, oi.order.customer_id)
      }
    })

    // 3. Day offset
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
    const dayOffset = diffDays(today, referenceDate)

    // 4. Parse valid rows
    const seenPairs = new Set<string>()
    const validRows: {
      customerId: string
      productId: string
      deviceId: string | null
      orderItemId: string | null
      status: string
      startDate: string
      endDate: string
      durationDays: number
      lastSentDay: number
    }[] = []

    let skipped = 0
    let customersCreated = 0

    // Collect customers to auto-create
    const customersToCreate = new Map<string, string>() // kakaoName → placeholder

    // First pass: identify customers that need creation
    for (const raw of rawRows) {
      const kakaoName = getField(raw, colMap, 'kakao')?.toString().trim()
      const orderNo = getField(raw, colMap, 'orderNo')?.toString().trim() || ''
      if (!kakaoName) continue
      if (customerMap.has(kakaoName)) continue
      if (orderNo && orderCustomerMap.has(orderNo)) continue
      customersToCreate.set(kakaoName, '')
    }

    // Bulk create missing customers
    if (customersToCreate.size > 0) {
      const newCustomers = [...customersToCreate.keys()].map(kakao => {
        // Parse kakao name: "홍길동/1234" → name="홍길동", phone_last4="1234"
        const parts = kakao.split('/')
        const name = parts[0] || kakao
        const phoneLast4 = parts[1] || null
        return {
          name,
          phone_last4: phoneLast4,
          kakao_friend_name: kakao,
        }
      })

      // Insert in batches of 500
      for (let i = 0; i < newCustomers.length; i += 500) {
        const batch = newCustomers.slice(i, i + 500)
        const { data, error } = await supabase
          .from('customers')
          .insert(batch)
          .select('id, kakao_friend_name')
        if (!error && data) {
          data.forEach(c => {
            if (c.kakao_friend_name) {
              customerMap.set(c.kakao_friend_name, c.id)
              customersCreated++
            }
          })
        }
      }
    }

    for (const raw of rawRows) {
      const sku = getField(raw, colMap, 'sku')?.toString().trim()
      const pcNumber = getField(raw, colMap, 'pc')?.toString().trim()
      const kakaoName = getField(raw, colMap, 'kakao')?.toString().trim()
      const orderNo = getField(raw, colMap, 'orderNo')?.toString().trim() || ''
      const statusRaw = getField(raw, colMap, 'status')?.toString().trim()

      if (!sku && !pcNumber && !kakaoName) { skipped++; continue }

      const productId = sku ? productMap.get(sku) || null : null
      const deviceId = pcNumber ? deviceMap.get(pcNumber) || null : null

      // Customer resolution: 1) kakao → 2) orderNo → order.customer_id → 3) just created above
      let customerId = kakaoName ? customerMap.get(kakaoName) || null : null
      if (!customerId && orderNo) {
        customerId = orderCustomerMap.get(orderNo) || null
      }

      if (!productId || !deviceId || !customerId) { skipped++; continue }

      const pairKey = `${customerId}::${productId}`
      if (seenPairs.has(pairKey)) { skipped++; continue }
      seenPairs.add(pairKey)

      const csvDay = parseNumber(getField(raw, colMap, 'day'))
      const durationDays = parseNumber(getField(raw, colMap, 'duration'))

      let lastSentDay: number
      if (dayInterpretation === 'already_sent') {
        lastSentDay = csvDay + dayOffset
      } else {
        lastSentDay = csvDay + dayOffset - 1
      }
      lastSentDay = Math.max(0, lastSentDay)
      if (durationDays > 0) lastSentDay = Math.min(lastSentDay, durationDays)

      const orderItemId = orderNo ? orderItemMap.get(orderNo) || null : null

      validRows.push({
        customerId,
        productId,
        deviceId,
        orderItemId,
        status: statusRaw ? parseStatus(statusRaw) : 'live',
        startDate: parseDate(getField(raw, colMap, 'startDate')),
        endDate: parseDate(getField(raw, colMap, 'endDate')),
        durationDays,
        lastSentDay,
      })
    }

    if (validRows.length === 0) {
      return NextResponse.json({ error: '임포트할 유효한 데이터가 없습니다' }, { status: 400 })
    }

    // 5. Find existing subscriptions for upsert
    const customerIds = [...new Set(validRows.map(r => r.customerId))]
    const productIds = [...new Set(validRows.map(r => r.productId))]

    const { data: existingSubs } = await supabase
      .from('subscriptions')
      .select('id, customer_id, product_id')
      .in('customer_id', customerIds)
      .in('product_id', productIds)

    const existingMap = new Map<string, string>()
    existingSubs?.forEach(s => {
      existingMap.set(`${s.customer_id}::${s.product_id}`, s.id)
    })

    // 6. Split into updates and inserts
    const updates: { id: string; data: Record<string, unknown> }[] = []
    const inserts: Record<string, unknown>[] = []

    for (const row of validRows) {
      const key = `${row.customerId}::${row.productId}`
      const existingId = existingMap.get(key)

      const subData = {
        customer_id: row.customerId,
        product_id: row.productId,
        device_id: row.deviceId,
        status: row.status,
        start_date: row.startDate || null,
        end_date: row.endDate || null,
        duration_days: row.durationDays,
        last_sent_day: row.lastSentDay,
        paused_days: 0,
        is_cancelled: row.status === 'cancel',
        order_item_id: row.orderItemId || null,
      }

      if (existingId) {
        updates.push({ id: existingId, data: subData })
      } else {
        inserts.push(subData)
      }
    }

    // 7. Execute updates in batches
    let updatedCount = 0
    let updateErrors = 0
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(({ id, data }) =>
          supabase.from('subscriptions').update(data).eq('id', id)
        )
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && !r.value.error) updatedCount++
        else updateErrors++
      }
    }

    // 8. Execute inserts in batches
    let createdCount = 0
    let insertErrors = 0
    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
      const batch = inserts.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('subscriptions').insert(batch)
      if (error) {
        for (const row of batch) {
          const { error: singleError } = await supabase.from('subscriptions').insert(row)
          if (singleError) insertErrors++
          else createdCount++
        }
      } else {
        createdCount += batch.length
      }
    }

    return NextResponse.json({
      ok: true,
      created: createdCount,
      updated: updatedCount,
      skipped,
      customersCreated,
      errors: updateErrors + insertErrors,
      total: rawRows.length,
    })
  } catch (err) {
    console.error('[subscriptions/import/confirm] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '임포트 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
