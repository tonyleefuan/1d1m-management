import { describe, it, expect } from 'vitest'
import { calcCurrentDay, calcComputedStatus, calcEndDate, calcPendingDays, computeSubscription } from './day'

describe('calcCurrentDay', () => {
  it('시작일 당일이면 Day 1', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-22',
      paused_days: 0,
      paused_at: null,
      today: '2026-03-22',
    })).toBe(1)
  })

  it('시작일 전이면 Day < 1', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-25',
      paused_days: 0,
      paused_at: null,
      today: '2026-03-22',
    })).toBe(-2)
  })

  it('paused_days 반영', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-01',
      paused_days: 5,
      paused_at: null,
      today: '2026-03-22',
    })).toBe(17)
  })

  it('정지 중이면 active_pause 반영', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-01',
      paused_days: 0,
      paused_at: '2026-03-20',
      today: '2026-03-22',
    })).toBe(20)
  })

  it('정지 중 + 과거 정지 일수', () => {
    expect(calcCurrentDay({
      start_date: '2026-03-01',
      paused_days: 3,
      paused_at: '2026-03-20',
      today: '2026-03-22',
    })).toBe(17)
  })
})

describe('calcComputedStatus', () => {
  it('is_cancelled이면 cancelled', () => {
    expect(calcComputedStatus({
      is_cancelled: true, paused_at: null, current_day: 10, last_sent_day: 5, duration_days: 365,
    })).toBe('cancelled')
  })

  it('paused_at이 있으면 paused', () => {
    expect(calcComputedStatus({
      is_cancelled: false, paused_at: '2026-03-20', current_day: 10, last_sent_day: 5, duration_days: 365,
    })).toBe('paused')
  })

  it('current_day < 1이면 pending', () => {
    expect(calcComputedStatus({
      is_cancelled: false, paused_at: null, current_day: -2, last_sent_day: 0, duration_days: 365,
    })).toBe('pending')
  })

  it('last_sent_day >= duration_days이면 completed', () => {
    expect(calcComputedStatus({
      is_cancelled: false, paused_at: null, current_day: 370, last_sent_day: 365, duration_days: 365,
    })).toBe('completed')
  })

  it('그 외에는 active', () => {
    expect(calcComputedStatus({
      is_cancelled: false, paused_at: null, current_day: 37, last_sent_day: 36, duration_days: 365,
    })).toBe('active')
  })
})

describe('calcEndDate', () => {
  it('정상 케이스', () => {
    expect(calcEndDate({
      start_date: '2026-03-01',
      duration_days: 90,
      paused_days: 0,
      active_pause: 0,
      missed_days: 0,
    })).toBe('2026-05-29')
  })

  it('밀린 일수 + 정지 일수 반영', () => {
    expect(calcEndDate({
      start_date: '2026-03-01',
      duration_days: 90,
      paused_days: 5,
      active_pause: 0,
      missed_days: 2,
    })).toBe('2026-06-05')
  })
})

describe('calcPendingDays', () => {
  it('정상: 1개', () => {
    expect(calcPendingDays(36, 37)).toEqual([37])
  })

  it('1일 밀림: 2개', () => {
    expect(calcPendingDays(36, 38)).toEqual([37, 38])
  })

  it('last_sent_day >= current_day: 빈 배열', () => {
    expect(calcPendingDays(37, 37)).toEqual([])
  })
})

describe('computeSubscription', () => {
  it('정상 활성 구독', () => {
    const result = computeSubscription({
      start_date: '2026-03-01',
      duration_days: 365,
      last_sent_day: 20,
      paused_days: 0,
      paused_at: null,
      is_cancelled: false,
    }, '2026-03-22')

    expect(result.current_day).toBe(22)
    expect(result.computed_status).toBe('active')
    expect(result.pending_days).toEqual([21, 22])
    expect(result.missed_days).toBe(1)
  })

  it('정지 중 구독', () => {
    const result = computeSubscription({
      start_date: '2026-03-01',
      duration_days: 365,
      last_sent_day: 9,
      paused_days: 0,
      paused_at: '2026-03-10',
      is_cancelled: false,
    }, '2026-03-22')

    expect(result.current_day).toBe(10)
    expect(result.computed_status).toBe('paused')
  })

  it('start_date가 null이면 pending', () => {
    const result = computeSubscription({
      start_date: null,
      duration_days: 365,
      last_sent_day: 0,
      paused_days: 0,
      paused_at: null,
      is_cancelled: false,
    })

    expect(result.computed_status).toBe('pending')
    expect(result.current_day).toBe(0)
  })
})
