/**
 * 아임웹 주문 엑셀 파싱 로직
 *
 * 3가지 주문 패턴:
 * A) 일반 구매: 상품SKU=SUB-46, 옵션SKU=365 → SUB-46을 365일 구독
 * B) 1+1 할인: 상품SKU=SUB-43, 옵션SKU=SUB-1 → SUB-1을 최대기간으로 구독 (is_addon=true)
 * C) 상품 선택형: 상품SKU=빈칸, 옵션SKU=SUB-45 → SUB-45을 최대기간으로 구독
 */

export interface RawOrderRow {
  '주문일': string
  '주문번호': string
  '주문섹션품목번호': string
  '주문자 이름': string
  '주문자 이메일': string
  '주문자 번호': string
  '상품 SKU': string
  '옵션 SKU': string
  '상품명': string
  '옵션명': string
  '구매수량': string
  '최종주문금액': string
}

export interface ParsedOrderItem {
  imweb_order_no: string
  imweb_item_no: string
  customer_name: string
  customer_email: string
  customer_phone: string
  product_sku: string        // 실제 구독할 상품 SKU
  duration_days: number | null  // null이면 해당 상품의 최대 기간 사용
  channel: 'kakaotalk' | 'imessage'
  is_addon: boolean
  raw_product_sku: string
  raw_option_sku: string
  raw_option_name: string
  ordered_at: string
  total_amount: number       // 주문 단위 금액
}

const DURATION_VALUES = ['90', '180', '365', '1000']

function parseChannel(optionName: string): 'kakaotalk' | 'imessage' {
  if (optionName?.toLowerCase().includes('imessage')) return 'imessage'
  return 'kakaotalk'
}

function parseDurationFromOptionName(optionName: string): number | null {
  // "(180일)" 또는 "(365일)" 패턴에서 숫자 추출
  const match = optionName?.match(/\((\d+)일\)/)
  if (match) return parseInt(match[1])
  return null
}

/**
 * 아임웹 엑셀의 빈 행 carry-forward 처리.
 * 같은 주문 내 중복 품목 행은 주문번호 등이 빈칸으로 내려온다.
 * 이전 행의 값을 이어받아 채워 넣는다.
 */
const CARRY_FORWARD_FIELDS: (keyof RawOrderRow)[] = [
  '주문번호', '주문자 이름', '주문자 이메일', '주문자 번호', '최종주문금액', '주문일',
]

function applyCarryForward(rows: RawOrderRow[]): RawOrderRow[] {
  const result: RawOrderRow[] = []
  let prev: Partial<RawOrderRow> = {}

  for (const raw of rows) {
    const row = { ...raw }
    for (const field of CARRY_FORWARD_FIELDS) {
      const val = row[field]?.toString().trim()
      if (!val) {
        // carry forward from previous row
        row[field] = (prev[field] as string) ?? ''
      }
    }
    // update prev for next iteration
    for (const field of CARRY_FORWARD_FIELDS) {
      const val = row[field]?.toString().trim()
      if (val) {
        prev[field] = val
      }
    }
    result.push(row)
  }
  return result
}

export function parseOrderRows(rows: RawOrderRow[]): ParsedOrderItem[] {
  const items: ParsedOrderItem[] = []
  const filledRows = applyCarryForward(rows)

  for (const row of filledRows) {
    const productSku = row['상품 SKU']?.trim() || ''
    const optionSku = row['옵션 SKU']?.trim() || ''
    const optionName = row['옵션명'] || ''
    const channel = parseChannel(optionName)

    let finalSku: string
    let durationDays: number | null
    let isAddon = false

    if (DURATION_VALUES.includes(optionSku)) {
      // 패턴 A: 일반 구매 — 옵션SKU가 기간
      finalSku = productSku
      durationDays = parseInt(optionSku)
    } else if (optionSku.includes(',')) {
      // 패턴 E: 세트 상품 — 옵션SKU에 콤마로 여러 상품
      // productSku(SUB-27 등)는 세트 코드일 뿐, 무시
      const setSKUs = optionSku.split(',').map(s => s.trim()).filter(s => s.startsWith('SUB-'))
      const baseInfo = {
        imweb_order_no: row['주문번호']?.trim() || '',
        imweb_item_no: row['주문섹션품목번호']?.trim() || '',
        customer_name: row['주문자 이름']?.trim() || '',
        customer_email: row['주문자 이메일']?.trim() || '',
        customer_phone: row['주문자 번호']?.trim() || '',
        channel,
        raw_product_sku: productSku,
        raw_option_sku: optionSku,
        raw_option_name: optionName,
        ordered_at: row['주문일']?.trim() || '',
        total_amount: parseInt(String(row['최종주문금액'] || '0').replace(/[₩,]/g, '')) || 0,
      }
      for (const sku of setSKUs) {
        items.push({
          ...baseInfo,
          product_sku: sku,
          duration_days: null, // 각 상품의 최대 기간으로 나중에 설정
          is_addon: true,
        })
      }
      continue
    } else if (optionSku.startsWith('SUB-')) {
      if (!productSku) {
        // 패턴 C: 상품 선택형 — 상품SKU 비어있음
        finalSku = optionSku
        durationDays = parseDurationFromOptionName(optionName)
      } else {
        // 패턴 B: 1+1 추가 상품
        finalSku = optionSku
        durationDays = parseDurationFromOptionName(optionName)
        isAddon = true
      }
    } else {
      // 알 수 없는 패턴 — 건너뛰기
      console.warn('Unknown SKU pattern:', { productSku, optionSku })
      continue
    }

    if (!finalSku) continue

    items.push({
      imweb_order_no: row['주문번호']?.trim() || '',
      imweb_item_no: row['주문섹션품목번호']?.trim() || '',
      customer_name: row['주문자 이름']?.trim() || '',
      customer_email: row['주문자 이메일']?.trim() || '',
      customer_phone: row['주문자 번호']?.trim() || '',
      product_sku: finalSku,
      duration_days: durationDays,
      channel,
      is_addon: isAddon,
      raw_product_sku: productSku,
      raw_option_sku: optionSku,
      raw_option_name: optionName,
      ordered_at: row['주문일']?.trim() || '',
      total_amount: parseInt(String(row['최종주문금액'] || '0').replace(/[₩,]/g, '')) || 0,
    })
  }

  return items
}
