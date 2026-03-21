'use client'

import React, { useState } from 'react'
import { cn } from '@/lib/utils'

/* ── PeriodTabs ──────────────────────────────────────
 *  차트 위 기간 선택 탭 (Last 3 months / Last 30 days / Last 7 days)
 *
 *  사용법:
 *    <PeriodTabs
 *      options={['최근 3개월', '최근 30일', '최근 7일']}
 *      value="최근 3개월"
 *      onChange={(v) => setPeriod(v)}
 *    />
 * ──────────────────────────────────────────────────── */

interface PeriodTabsProps {
  options: string[]
  value?: string
  onChange?: (value: string) => void
  className?: string
}

export function PeriodTabs({
  options,
  value,
  onChange,
  className,
}: PeriodTabsProps) {
  const [selected, setSelected] = useState(value ?? options[0])

  const handleClick = (opt: string) => {
    setSelected(opt)
    onChange?.(opt)
  }

  return (
    <div className={cn('flex gap-1', className)}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => handleClick(opt)}
          className={cn(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            (value ?? selected) === opt
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
