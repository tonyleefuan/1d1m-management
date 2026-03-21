'use client'

import React from 'react'
import { cn } from '@/lib/utils'

/* ── GenderToggle ─────────────────────────────────────
 *  남성/여성 토글 버튼
 *
 *  사용법:
 *    <GenderToggle
 *      value={{ for_men: true, for_women: false }}
 *      onChange={(v) => update(v)}
 *    />
 *
 *    <GenderToggle size="compact" ... />   // 테이블 셀용
 * ──────────────────────────────────────────────────── */

const GENDERS = [
  { key: 'for_men', label: '남성', short: 'M', color: '#2959FD' },
  { key: 'for_women', label: '여성', short: 'W', color: '#EC4899' },
] as const

type GenderKeys = 'for_men' | 'for_women'
type GenderValue = Record<GenderKeys, boolean>

interface GenderToggleProps {
  value: GenderValue
  onChange?: (value: GenderValue) => void
  disabled?: boolean
  /** compact: 테이블 셀용 (작은 크기), default: 폼/모달용 */
  size?: 'default' | 'compact'
  className?: string
}

export function GenderToggle({
  value,
  onChange,
  disabled = false,
  size = 'default',
  className,
}: GenderToggleProps) {
  const isCompact = size === 'compact'

  const toggle = (key: GenderKeys) => {
    if (disabled || !onChange) return
    onChange({ ...value, [key]: !value[key] })
  }

  return (
    <div className={cn('inline-flex gap-1', className)}>
      {GENDERS.map(({ key, label, short, color }) => {
        const active = value[key]
        return (
          <button
            key={key}
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(key) }}
            disabled={disabled}
            className={cn(
              'rounded-md font-semibold transition-all duration-150 border',
              isCompact
                ? 'text-[10px] px-1.5 py-0.5 min-w-[22px]'
                : 'text-xs px-2.5 py-1.5 min-w-[40px]',
              active
                ? 'border-transparent text-white shadow-sm'
                : 'border-transparent bg-muted text-muted-foreground',
              disabled && 'opacity-50 cursor-not-allowed',
              !disabled && !active && 'hover:bg-muted/80',
            )}
            style={active ? { backgroundColor: color } : undefined}
            title={label}
          >
            {isCompact ? short : label}
          </button>
        )
      })}
    </div>
  )
}

/** 성별 도트 — 읽기 전용 표시용 */
export function GenderDots({ value, className }: { value: GenderValue; className?: string }) {
  const active = GENDERS.filter(g => value[g.key])
  if (active.length === 0) return <span className="text-xs text-muted-foreground">-</span>
  return (
    <div className={cn('inline-flex gap-1 items-center', className)}>
      {active.map(({ key, short, color }) => (
        <span
          key={key}
          className="text-[10px] font-bold px-1 py-0.5 rounded"
          style={{ color, backgroundColor: color + '18' }}
        >
          {short}
        </span>
      ))}
    </div>
  )
}
