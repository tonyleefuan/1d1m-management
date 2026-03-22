import { ComputedStatus } from './types'

// KST 기준 오늘 날짜 (YYYY-MM-DD)
export function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

// 두 날짜 사이의 일수 차이
function diffDays(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.floor((new Date(a).getTime() - new Date(b).getTime()) / msPerDay)
}

// 날짜에 일수 더하기
function addDays(date: string, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

interface CalcCurrentDayInput {
  start_date: string
  paused_days: number
  paused_at: string | null
  today?: string
}

export function calcCurrentDay(input: CalcCurrentDayInput): number {
  const today = input.today || todayKST()
  const elapsed = diffDays(today, input.start_date) + 1
  // paused_at이 타임스탬프면 KST 날짜로 정규화
  let pausedAtDate = input.paused_at
  if (pausedAtDate && pausedAtDate.length > 10) {
    pausedAtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(pausedAtDate))
  }
  const activePause = pausedAtDate ? Math.max(0, diffDays(today, pausedAtDate)) : 0
  return elapsed - input.paused_days - activePause
}

interface CalcStatusInput {
  is_cancelled: boolean
  paused_at: string | null
  current_day: number
  last_sent_day: number
  duration_days: number
}

export function calcComputedStatus(input: CalcStatusInput): ComputedStatus {
  if (input.is_cancelled) return 'cancelled'
  if (input.paused_at) return 'paused'
  if (input.current_day < 1) return 'pending'
  if (input.last_sent_day >= input.duration_days) return 'completed'
  return 'active'
}

interface CalcEndDateInput {
  start_date: string
  duration_days: number
  paused_days: number
  active_pause: number
  missed_days: number
}

export function calcEndDate(input: CalcEndDateInput): string {
  const totalExtra = input.paused_days + input.active_pause + input.missed_days
  return addDays(input.start_date, input.duration_days - 1 + totalExtra)
}

export function calcPendingDays(lastSentDay: number, currentDay: number): number[] {
  if (lastSentDay >= currentDay) return []
  const days: number[] = []
  for (let d = lastSentDay + 1; d <= currentDay; d++) {
    days.push(d)
  }
  return days
}

export function calcMissedDays(currentDay: number, lastSentDay: number): number {
  return Math.max(0, currentDay - lastSentDay - 1)
}

// 구독 행에서 모든 계산값을 한 번에 산출
export function computeSubscription(sub: {
  start_date: string | null
  duration_days: number
  last_sent_day: number
  paused_days: number
  paused_at: string | null
  is_cancelled: boolean
}, today?: string) {
  const t = today || todayKST()

  if (!sub.start_date) {
    return {
      current_day: 0,
      computed_status: 'pending' as ComputedStatus,
      computed_end_date: '',
      pending_days: [] as number[],
      missed_days: 0,
    }
  }

  // paused_at이 타임스탬프면 KST 날짜로 정규화
  let pausedAtDate = sub.paused_at
  if (pausedAtDate && pausedAtDate.length > 10) {
    pausedAtDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(pausedAtDate))
  }
  const activePause = pausedAtDate ? Math.max(0, diffDays(t, pausedAtDate)) : 0
  const currentDay = calcCurrentDay({
    start_date: sub.start_date,
    paused_days: sub.paused_days,
    paused_at: sub.paused_at,
    today: t,
  })

  const computedStatus = calcComputedStatus({
    is_cancelled: sub.is_cancelled,
    paused_at: sub.paused_at,
    current_day: currentDay,
    last_sent_day: sub.last_sent_day,
    duration_days: sub.duration_days,
  })

  const missedDays = calcMissedDays(currentDay, sub.last_sent_day)

  const computedEndDate = calcEndDate({
    start_date: sub.start_date,
    duration_days: sub.duration_days,
    paused_days: sub.paused_days,
    active_pause: activePause,
    missed_days: missedDays,
  })

  const pendingDays = calcPendingDays(sub.last_sent_day, currentDay)

  return {
    current_day: currentDay,
    computed_status: computedStatus,
    computed_end_date: computedEndDate,
    pending_days: pendingDays,
    missed_days: missedDays,
  }
}
