import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import * as XLSX from 'xlsx'

// ─── Types ───────────────────────────────────────────────

interface CsvRow {
  'PC 번호': string
  '카톡이름': string
  '시작일': string
  '종료일': string
  '상품': string
  'Day': number | string
  'D-Day': number | string
  'SKU': string
  '기간': number | string
}

export interface ParsedImportRow {
  rowIndex: number
  pcNumber: string
  kakaoName: string
  startDate: string
  endDate: string
  status: string
  csvDay: number
  dDay: number
  sku: string
  durationDays: number
  // Resolved IDs
  customerId: string | null
  productId: string | null
  deviceId: string | null
  // Computed
  lastSentDay: number
  // Skip reason
  skipReason: string | null
}

export interface ImportPreviewResponse {
  rows: ParsedImportRow[]
  summary: {
    total: number
    valid: number
    skippedSku: number
    skippedPc: number
    skippedCustomer: number
    duplicateInCsv: number
    skippedEmpty: number
  }
  missingSkus: string[]
  missingPcs: string[]
  missingCustomers: string[]
}

// ─── Helpers ─────────────────────────────────────────────

function parseDate(value: unknown): string {
  if (!value) return ''
  const s = String(value).trim()
  // Handle Excel serial date numbers
  if (/^\d{5}$/.test(s)) {
    const date = new Date((Number(s) - 25569) * 86400000)
    return date.toISOString().slice(0, 10)
  }
  // Handle YYYY-MM-DD or YYYY/MM/DD
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

    if (!file) return NextResponse.json({ error: '파일을 선택해주세요' }, { status: 400 })
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 크기는 20MB 이하만 가능합니다' }, { status: 400 })
    }

    // 1. Parse CSV/Excel
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(sheet) as CsvRow[]

    if (rawRows.length === 0) {
      return NextResponse.json({ error: '데이터가 없습니다' }, { status: 400 })
    }

    // 2. Load reference tables
    const [productsRes, devicesRes, customersRes] = await Promise.all([
      supabase.from('products').select('id, sku_code'),
      supabase.from('send_devices').select('id, phone_number'),
      supabase.from('customers').select('id, kakao_friend_name'),
    ])

    const productMap = new Map<string, string>()
    productsRes.data?.forEach(p => productMap.set(p.sku_code, p.id))

    const deviceMap = new Map<string, string>()
    devicesRes.data?.forEach(d => deviceMap.set(d.phone_number, d.id))

    // customers: kakao_friend_name can have duplicates, use first match
    const customerMap = new Map<string, string>()
    customersRes.data?.forEach(c => {
      if (c.kakao_friend_name && !customerMap.has(c.kakao_friend_name)) {
        customerMap.set(c.kakao_friend_name, c.id)
      }
    })

    // 3. Compute today for day offset
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
    const dayOffset = diffDays(today, referenceDate)

    // 4. Parse rows
    const summary = {
      total: rawRows.length,
      valid: 0,
      skippedSku: 0,
      skippedPc: 0,
      skippedCustomer: 0,
      duplicateInCsv: 0,
      skippedEmpty: 0,
    }
    const missingSkus = new Set<string>()
    const missingPcs = new Set<string>()
    const missingCustomers = new Set<string>()
    const seenPairs = new Set<string>()
    const rows: ParsedImportRow[] = []

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i]
      const sku = raw['SKU']?.toString().trim()
      const pcNumber = raw['PC 번호']?.toString().trim()
      const kakaoName = raw['카톡이름']?.toString().trim()
      const statusRaw = raw['상품']?.toString().trim()

      // Skip empty rows
      if (!sku && !pcNumber && !kakaoName) {
        summary.skippedEmpty++
        continue
      }

      const productId = sku ? productMap.get(sku) || null : null
      const deviceId = pcNumber ? deviceMap.get(pcNumber) || null : null
      const customerId = kakaoName ? customerMap.get(kakaoName) || null : null

      let skipReason: string | null = null

      if (!productId) {
        skipReason = `SKU 미매칭: ${sku || '(없음)'}`
        summary.skippedSku++
        if (sku) missingSkus.add(sku)
      } else if (!deviceId) {
        skipReason = `PC 미매칭: ${pcNumber || '(없음)'}`
        summary.skippedPc++
        if (pcNumber) missingPcs.add(pcNumber)
      } else if (!customerId) {
        skipReason = `고객 미매칭: ${kakaoName || '(없음)'}`
        summary.skippedCustomer++
        if (kakaoName) missingCustomers.add(kakaoName)
      }

      // CSV duplicate check (customer_id + product_id)
      if (!skipReason && customerId && productId) {
        const pairKey = `${customerId}::${productId}`
        if (seenPairs.has(pairKey)) {
          skipReason = `CSV 내 중복 (같은 고객+상품)`
          summary.duplicateInCsv++
        } else {
          seenPairs.add(pairKey)
        }
      }

      const csvDay = parseNumber(raw['Day'])
      const durationDays = parseNumber(raw['기간'])

      // last_sent_day calculation with day offset
      let lastSentDay: number
      if (dayInterpretation === 'already_sent') {
        lastSentDay = csvDay + dayOffset
      } else {
        lastSentDay = csvDay + dayOffset - 1
      }
      lastSentDay = Math.max(0, lastSentDay)
      // Cap at duration
      if (durationDays > 0) {
        lastSentDay = Math.min(lastSentDay, durationDays)
      }

      if (!skipReason) summary.valid++

      rows.push({
        rowIndex: i + 1,
        pcNumber: pcNumber || '',
        kakaoName: kakaoName || '',
        startDate: parseDate(raw['시작일']),
        endDate: parseDate(raw['종료일']),
        status: statusRaw ? parseStatus(statusRaw) : 'live',
        csvDay,
        dDay: parseNumber(raw['D-Day']),
        sku: sku || '',
        durationDays,
        customerId,
        productId,
        deviceId,
        lastSentDay,
        skipReason,
      })
    }

    const response: ImportPreviewResponse = {
      rows,
      summary,
      missingSkus: [...missingSkus],
      missingPcs: [...missingPcs],
      missingCustomers: [...missingCustomers],
    }

    return NextResponse.json(response)
  } catch (err) {
    console.error('[subscriptions/import] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '임포트 파싱 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
