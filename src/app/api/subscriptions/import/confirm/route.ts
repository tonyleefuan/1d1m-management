import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import * as XLSX from 'xlsx'

const BATCH_SIZE = 500
const IN_CHUNK = 300 // .in() query chunk size to avoid URL length limit

// ─── Column matching (shared with ../route.ts) ──────────

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

function parseDateKST(value: unknown): string {
  if (!value) return ''
  const s = String(value).trim()
  // Excel serial dates (integer or decimal)
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 30000) {
    const d = new Date((Number(s) - 25569) * 86400000)
    // Use KST to avoid off-by-one
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
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
}

/** Chunked .in() query to avoid Supabase URL length limit */
async function queryInChunks<T>(
  table: string,
  select: string,
  field: string,
  values: string[],
): Promise<T[]> {
  const results: T[] = []
  for (let i = 0; i < values.length; i += IN_CHUNK) {
    const chunk = values.slice(i, i + IN_CHUNK)
    const { data } = await supabase.from(table).select(select).in(field, chunk)
    if (data) results.push(...(data as T[]))
  }
  return results
}

// ─── POST handler ────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const dayInterpretation = formData.get('dayInterpretation') as string || 'already_sent'
    // Fix #6: dynamic default date
    const referenceDate = formData.get('referenceDate') as string
      || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

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
    const [productsRes, devicesRes, customersRes] = await Promise.all([
      supabase.from('products').select('id, sku_code'),
      supabase.from('send_devices').select('id, phone_number'),
      supabase.from('customers').select('id, kakao_friend_name, phone'),
    ])

    const productMap = new Map<string, string>()
    productsRes.data?.forEach(p => productMap.set(p.sku_code, p.id))

    const deviceMap = new Map<string, string>()
    devicesRes.data?.forEach(d => deviceMap.set(d.phone_number, d.id))

    const customerMap = new Map<string, string>() // kakao → id
    customersRes.data?.forEach(c => {
      if (c.kakao_friend_name && !customerMap.has(c.kakao_friend_name)) {
        customerMap.set(c.kakao_friend_name, c.id)
      }
    })

    // 3. Day offset
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
    const dayOffset = diffDays(today, referenceDate)

    // 4. Auto-create missing customers (Fix #1: upsert-safe)
    let customersCreated = 0
    const customersToCreate = new Map<string, string>() // kakao → orderNo
    for (const raw of rawRows) {
      const kakaoName = getField(raw, colMap, 'kakao')?.toString().trim()
      if (!kakaoName || customerMap.has(kakaoName)) continue
      if (!customersToCreate.has(kakaoName)) {
        customersToCreate.set(kakaoName, getField(raw, colMap, 'orderNo')?.toString().trim() || '')
      }
    }

    if (customersToCreate.size > 0) {
      const newCustomers = [...customersToCreate.entries()].map(([kakao]) => {
        const parts = kakao.split('/')
        return {
          name: parts[0] || kakao,
          phone_last4: parts[1] || null,
          kakao_friend_name: kakao,
        }
      })

      for (let i = 0; i < newCustomers.length; i += BATCH_SIZE) {
        const batch = newCustomers.slice(i, i + BATCH_SIZE)
        // Fix #1: use upsert to handle retry safely
        const { data, error } = await supabase
          .from('customers')
          .upsert(batch, { onConflict: 'kakao_friend_name', ignoreDuplicates: true })
          .select('id, kakao_friend_name')

        // Fix #4: surface error
        if (error) {
          console.error('[import/confirm] Customer upsert error:', error.message)
        }
        if (data) {
          data.forEach(c => {
            if (c.kakao_friend_name) {
              customerMap.set(c.kakao_friend_name, c.id)
              customersCreated++
            }
          })
        }
      }

      // Fetch any that ignoreDuplicates skipped (already existed)
      const missingKakao = [...customersToCreate.keys()].filter(k => !customerMap.has(k))
      if (missingKakao.length > 0) {
        const existing = await queryInChunks<{ id: string; kakao_friend_name: string }>(
          'customers', 'id, kakao_friend_name', 'kakao_friend_name', missingKakao
        )
        existing.forEach(c => {
          if (c.kakao_friend_name) customerMap.set(c.kakao_friend_name, c.id)
        })
      }
    }

    // 5. Parse valid rows
    const seenPairs = new Set<string>()
    interface ValidRow {
      customerId: string
      productId: string
      deviceId: string | null
      orderItemId: string | null
      orderNo: string
      sku: string
      status: string
      startDate: string
      endDate: string
      durationDays: number
      lastSentDay: number
    }
    const validRows: ValidRow[] = []
    let skipped = 0

    for (const raw of rawRows) {
      const sku = getField(raw, colMap, 'sku')?.toString().trim()
      const pcNumber = getField(raw, colMap, 'pc')?.toString().trim()
      const kakaoName = getField(raw, colMap, 'kakao')?.toString().trim()
      const orderNo = getField(raw, colMap, 'orderNo')?.toString().trim() || ''
      const statusRaw = getField(raw, colMap, 'status')?.toString().trim()

      if (!sku && !pcNumber && !kakaoName) { skipped++; continue }

      const productId = sku ? productMap.get(sku) || null : null
      const deviceId = pcNumber ? deviceMap.get(pcNumber) || null : null
      const customerId = kakaoName ? customerMap.get(kakaoName) || null : null

      if (!productId || !deviceId || !customerId) { skipped++; continue }

      const pairKey = `${customerId}::${productId}`
      if (seenPairs.has(pairKey)) { skipped++; continue }
      seenPairs.add(pairKey)

      const csvDay = parseNumber(getField(raw, colMap, 'day'))
      const durationDays = parseNumber(getField(raw, colMap, 'duration'))

      let lastSentDay = dayInterpretation === 'already_sent'
        ? csvDay + dayOffset
        : csvDay + dayOffset - 1
      lastSentDay = Math.max(0, lastSentDay)
      if (durationDays > 0) lastSentDay = Math.min(lastSentDay, durationDays)

      validRows.push({
        customerId, productId, deviceId,
        orderItemId: null, // resolved in step 6
        orderNo, sku: sku || '',
        status: statusRaw ? parseStatus(statusRaw) : 'live',
        startDate: parseDateKST(getField(raw, colMap, 'startDate')),
        endDate: parseDateKST(getField(raw, colMap, 'endDate')),
        durationDays, lastSentDay,
      })
    }

    if (validRows.length === 0) {
      return NextResponse.json({ error: '임포트할 유효한 데이터가 없습니다' }, { status: 400 })
    }

    // 6. Create orders + order_items from CSV orderNo
    const rowsWithOrderNo = validRows.filter(r => r.orderNo)
    if (rowsWithOrderNo.length > 0) {
      const orderGroups = new Map<string, ValidRow[]>()
      for (const row of rowsWithOrderNo) {
        const group = orderGroups.get(row.orderNo) || []
        group.push(row)
        orderGroups.set(row.orderNo, group)
      }

      // Upsert orders
      const orderRows = [...orderGroups.entries()].map(([orderNo, rows]) => ({
        imweb_order_no: orderNo,
        customer_id: rows[0].customerId,
        total_amount: 0,
        ordered_at: rows[0].startDate || today,
      }))

      for (let i = 0; i < orderRows.length; i += BATCH_SIZE) {
        await supabase
          .from('orders')
          .upsert(orderRows.slice(i, i + BATCH_SIZE), { onConflict: 'imweb_order_no', ignoreDuplicates: true })
      }

      // Get all order IDs (chunked)
      const orderNos = [...orderGroups.keys()]
      const allOrders = await queryInChunks<{ id: string; imweb_order_no: string }>(
        'orders', 'id, imweb_order_no', 'imweb_order_no', orderNos
      )
      const orderNoToId = new Map(allOrders.map(o => [o.imweb_order_no, o.id]))

      // Create order_items (Fix #3: prefix with csv_ to avoid collision with real imweb items)
      const orderItemRows = rowsWithOrderNo
        .filter(r => orderNoToId.has(r.orderNo))
        .map(r => ({
          order_id: orderNoToId.get(r.orderNo)!,
          imweb_item_no: `csv_${r.orderNo}_${r.sku}`,
          product_id: r.productId,
          duration_days: r.durationDays,
          list_price: 0,
          allocated_amount: 0,
        }))

      for (let i = 0; i < orderItemRows.length; i += BATCH_SIZE) {
        await supabase
          .from('order_items')
          .upsert(orderItemRows.slice(i, i + BATCH_SIZE), { onConflict: 'imweb_item_no', ignoreDuplicates: true })
      }

      // Fetch all created/existing items (chunked)
      const itemNos = orderItemRows.map(r => r.imweb_item_no)
      const allItems = await queryInChunks<{ id: string; imweb_item_no: string }>(
        'order_items', 'id, imweb_item_no', 'imweb_item_no', itemNos
      )
      const createdItemMap = new Map(allItems.map(oi => [oi.imweb_item_no, oi.id]))

      // Link order_item_ids to validRows
      for (const row of validRows) {
        if (row.orderNo) {
          row.orderItemId = createdItemMap.get(`csv_${row.orderNo}_${row.sku}`) || null
        }
      }
    }

    // 7. Find existing subscriptions (Fix #4: chunked .in() to avoid URL limit)
    const uniqueCustomerIds = [...new Set(validRows.map(r => r.customerId))]
    const existingSubs = await queryInChunks<{ id: string; customer_id: string; product_id: string }>(
      'subscriptions', 'id, customer_id, product_id', 'customer_id', uniqueCustomerIds
    )
    const existingMap = new Map<string, string>()
    existingSubs.forEach(s => existingMap.set(`${s.customer_id}::${s.product_id}`, s.id))

    // 8. Split into updates and inserts
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

    // 9. Execute updates — batch SQL instead of individual calls (Fix #4: timeout)
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

    // 10. Execute inserts in batches
    let createdCount = 0
    let insertErrors = 0
    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
      const batch = inserts.slice(i, i + BATCH_SIZE)
      const { error } = await supabase.from('subscriptions').insert(batch)
      if (error) {
        // Fallback: one-by-one
        for (const row of batch) {
          const { error: e } = await supabase.from('subscriptions').insert(row)
          if (e) insertErrors++
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
