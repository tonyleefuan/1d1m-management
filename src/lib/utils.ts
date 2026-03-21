import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind classes — shadcn/ui standard utility */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ═══════════════════════════════════════════════════════════════════
 *  숫자 포맷터 — 모든 탭에서 공통으로 사용
 *
 *  ⚠️ 각 탭에서 fmtKrw, fmtShort, fmtDec 등을 직접 만들지 마세요!
 *  이 파일의 함수를 import해서 사용하세요.
 *
 *  import { fmt, fmtKrw, fmtNum, fmtPct, fmtDec } from '@/lib/utils'
 * ═══════════════════════════════════════════════════════════════════ */

/** 한국식 축약 숫자 (억/만 변환, ₩ 없음) — fmt(15234567) → "1,523만" */
export function fmt(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '-'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 100_000_000) {
    const v = abs / 100_000_000
    return v % 1 === 0
      ? sign + v.toLocaleString('ko-KR') + '억'
      : sign + v.toFixed(1) + '억'
  }
  if (abs >= 10_000) return sign + Math.round(abs / 10_000).toLocaleString('ko-KR') + '만'
  return sign + Math.round(abs).toLocaleString('ko-KR')
}

/** 원화 축약 (₩ 포함) — fmtKrw(15234567) → "₩1,523만" */
export function fmtKrw(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '-'
  if (n === 0) return '₩0'
  return `₩${fmt(n)}`
}

/** 일반 숫자 로컬라이즈 — fmtNum(1234) → "1,234" */
export function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '-'
  return n.toLocaleString('ko-KR')
}

/** 소수점 N자리 — fmtDec(3.1415, 2) → "3.14" */
export function fmtDec(n: number | undefined | null, decimals = 1): string {
  if (n === undefined || n === null || isNaN(n)) return '-'
  return n.toFixed(decimals)
}

/** 퍼센트 (0~100 기준) — fmtPct(42.567) → "42.6%" */
export function fmtPct(n: number | undefined | null, decimals = 1): string {
  if (n === undefined || n === null || isNaN(n)) return '-'
  return n.toFixed(decimals) + '%'
}

/** 비율을 퍼센트로 (0~1 → 0~100) — pct(0.425) → "42.5%" */
export function pct(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(n)) return '-'
  return (n * 100).toFixed(1) + '%'
}

/* ═══════════════════════════════════════════════════════════════════
 *  날짜 헬퍼 — 모든 탭에서 공통으로 사용
 *
 *  import { toKST, getDaysAgo, fmtDateTime, getDateString } from '@/lib/utils'
 * ═══════════════════════════════════════════════════════════════════ */

/** Get today's date in YYYY.MM.DD format */
export function getDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

/** Date → KST 날짜 문자열 (YYYY-MM-DD) */
export function toKST(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

/** N일 전 날짜 (KST, YYYY-MM-DD) */
export function getDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toKST(d)
}

/** ISO 날짜 → "MM-DD HH:mm" (KST) */
export function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  const date = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5)
  const time = d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} ${time}`
}

/** 오늘 날짜 (KST, YYYY-MM-DD) */
export function getToday(): string {
  return toKST(new Date())
}

/** 이번달 1일 (KST, YYYY-MM-DD) */
export function getMonthStart(): string {
  const d = new Date()
  d.setDate(1)
  return toKST(d)
}

/* ═══════════════════════════════════════════════════════════════════
 *  자연 정렬 — "SUB-1, SUB-2, ..., SUB-10" / "PC 1, PC 2, ..., PC 10"
 * ═══════════════════════════════════════════════════════════════════ */
export function naturalCompare(a: string, b: string): number {
  return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' })
}

/** 객체 배열을 특정 키의 자연 정렬로 정렬 */
export function naturalSortBy<T>(arr: T[], key: keyof T): T[] {
  return [...arr].sort((a, b) => naturalCompare(String(a[key] ?? ''), String(b[key] ?? '')))
}
