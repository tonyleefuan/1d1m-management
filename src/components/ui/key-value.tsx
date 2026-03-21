import React from 'react'
import { cn } from '@/lib/utils'

/* ── KeyValue ─────────────────────────────────────
 *  간단한 라벨-값 인라인 표시 (카드 안에서 한 줄로)
 *  ListCard, 모달 헤더 등에서 사용
 *
 *  사용법:
 *    <KeyValue label="주문번호" value="ORD-2025-001" />
 *    <KeyValue label="금액" value="₩198,000" valueClassName="font-bold" />
 *    <KeyValue label="상태" value={<StatusBadge status="success">완료</StatusBadge>} />
 *
 *    <KeyValueGrid>
 *      <KeyValue label="A" value="1" />
 *      <KeyValue label="B" value="2" />
 *    </KeyValueGrid>
 * ──────────────────────────────────────────────────── */

interface KeyValueProps {
  label: string
  value: React.ReactNode
  /** 방향: horizontal(기본), vertical(세로) */
  direction?: 'horizontal' | 'vertical'
  /** 값 색상 레벨: good(초록), bad(빨강), neutral(기본) */
  level?: 'good' | 'bad' | 'neutral'
  valueClassName?: string
  className?: string
}

const levelColors = {
  good: 'text-hh-green',
  bad: 'text-hh-red',
  neutral: '',
}

export function KeyValue({ label, value, direction = 'horizontal', level, valueClassName, className }: KeyValueProps) {
  const levelClass = level ? levelColors[level] : ''

  if (direction === 'vertical') {
    return (
      <div className={cn('', className)}>
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={cn('mt-0.5 text-sm', levelClass, valueClassName)}>{value ?? '-'}</div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm', levelClass, valueClassName)}>{value ?? '-'}</span>
    </div>
  )
}

interface KeyValueGridProps {
  cols?: 2 | 3 | 4
  children: React.ReactNode
  className?: string
}

const gridMap: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
}

export function KeyValueGrid({ cols = 2, children, className }: KeyValueGridProps) {
  return (
    <div className={cn('grid gap-x-6 gap-y-2', gridMap[cols], className)}>
      {children}
    </div>
  )
}
