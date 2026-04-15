import 'server-only'
import { supabase } from '@/lib/supabase'
import { todayKST, daysAgoKST } from '@/lib/day'

// ─── Types ──────────────────────────────────────────

export interface SendHistoryEntry {
  send_date: string
  day_number: number
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  message_snippet: string
}

export interface SendHistoryAnomalies {
  duplicates: Array<{ send_date: string; day_number: number; count: number }>
  gaps: number[]                   // 빠진 day_number 목록
  unresolved_failures: Array<{ send_date: string; day_number: number }>
}

export interface SendHistoryResult {
  entries: SendHistoryEntry[]
  anomalies: SendHistoryAnomalies
  subscription_id: string
  from_date: string
  to_date: string
}

// ─── Helpers ────────────────────────────────────────

function extractFirstLine(content: string | null | undefined): string {
  if (!content) return ''
  const firstLine = content.split(/\r?\n/)[0].trim()
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine
}

// ─── Query ──────────────────────────────────────────

export async function querySendHistory(
  subscriptionId: string,
  fromDate?: string,
  toDate?: string,
): Promise<{ data: SendHistoryEntry[] | null; error: string | null }> {
  const to = toDate || todayKST()
  const from = fromDate || daysAgoKST(7)

  const { data, error } = await supabase
    .from('send_queues')
    .select('send_date, day_number, status, sent_at, message_content, sort_order')
    .eq('subscription_id', subscriptionId)
    .eq('is_notice', false)
    .gte('send_date', from)
    .lte('send_date', to)
    .order('send_date', { ascending: true })
    .order('day_number', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(500)

  if (error) return { data: null, error: error.message }

  // 같은 day_number의 multi-message(text+image)를 대표 1행으로 합침
  // 상태 우선순위: failed > pending > sent
  const grouped = new Map<string, SendHistoryEntry>()
  const STATUS_PRIORITY: Record<string, number> = { failed: 2, pending: 1, sent: 0 }

  for (const row of data || []) {
    const key = `${row.send_date}|${row.day_number}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, {
        send_date: row.send_date,
        day_number: row.day_number,
        status: row.status,
        sent_at: row.sent_at,
        message_snippet: extractFirstLine(row.message_content),
      })
    } else {
      // worst status 유지
      if ((STATUS_PRIORITY[row.status] ?? 0) > (STATUS_PRIORITY[existing.status] ?? 0)) {
        existing.status = row.status
      }
      // sent_at은 가장 빠른 것 유지
      if (row.sent_at && (!existing.sent_at || row.sent_at < existing.sent_at)) {
        existing.sent_at = row.sent_at
      }
      // snippet이 비어있고 이 행에 본문이 있으면 덮어쓰기 (이미지 행이 먼저 온 경우 대응)
      if (!existing.message_snippet && row.message_content) {
        existing.message_snippet = extractFirstLine(row.message_content)
      }
    }
  }

  return { data: Array.from(grouped.values()), error: null }
}

// ─── Anomaly Detection ──────────────────────────────

export function detectAnomalies(entries: SendHistoryEntry[]): SendHistoryAnomalies {
  const duplicates: SendHistoryAnomalies['duplicates'] = []
  const unresolved_failures: SendHistoryAnomalies['unresolved_failures'] = []

  // 1. 같은 send_date에 같은 day_number가 여러 건 → 중복
  //    (querySendHistory에서 이미 merge했으므로, raw data 기준으로 판단 필요)
  //    → 대신: 같은 send_date에 2개 이상의 서로 다른 day_number가 sent → 중복 발송
  const dateToSentDays = new Map<string, number[]>()
  for (const e of entries) {
    if (e.status === 'sent') {
      const arr = dateToSentDays.get(e.send_date) || []
      arr.push(e.day_number)
      dateToSentDays.set(e.send_date, arr)
    }
  }
  for (const [send_date, days] of dateToSentDays) {
    if (days.length > 1) {
      // 한 날짜에 여러 Day가 발송됨 → 중복 발송
      for (const day_number of days) {
        duplicates.push({ send_date, day_number, count: days.length })
      }
    }
  }

  // 2. day_number 시퀀스의 갭
  const allDays = [...new Set(entries.map(e => e.day_number))].sort((a, b) => a - b)
  const gaps: number[] = []
  if (allDays.length >= 2) {
    for (let d = allDays[0] + 1; d < allDays[allDays.length - 1]; d++) {
      if (!allDays.includes(d)) gaps.push(d)
    }
  }

  // 3. 미해결 실패: failed인데 같은 day_number에 sent가 없음
  const sentDays = new Set(entries.filter(e => e.status === 'sent').map(e => e.day_number))
  for (const e of entries) {
    if (e.status === 'failed' && !sentDays.has(e.day_number)) {
      unresolved_failures.push({ send_date: e.send_date, day_number: e.day_number })
    }
  }

  return { duplicates, gaps, unresolved_failures }
}
