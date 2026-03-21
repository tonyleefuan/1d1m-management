'use client'

import React from 'react'
import { cn } from '@/lib/utils'

/* ── SeasonToggle ─────────────────────────────────────
 *  봄/여름/가을/겨울 4개 토글 버튼
 *
 *  사용법:
 *    <SeasonToggle
 *      value={{ is_spring: true, is_summer: false, is_autumn: true, is_winter: false }}
 *      onChange={(v) => update(v)}
 *    />
 *
 *    <SeasonToggle size="compact" ... />   // 테이블 셀용
 * ──────────────────────────────────────────────────── */

const SEASONS = [
  { key: 'is_spring', label: '봄', short: 'Sp', color: '#F2A0C4' },
  { key: 'is_summer', label: '여름', short: 'Su', color: '#FF9720' },
  { key: 'is_autumn', label: '가을', short: 'Fw', color: '#C47A3F' },
  { key: 'is_winter', label: '겨울', short: 'Wi', color: '#6BA3D6' },
] as const

type SeasonKeys = 'is_spring' | 'is_summer' | 'is_autumn' | 'is_winter'
type SeasonValue = Record<SeasonKeys, boolean>

interface SeasonToggleProps {
  value: SeasonValue
  onChange?: (value: SeasonValue) => void
  disabled?: boolean
  /** compact: 테이블 셀용 (작은 크기), default: 폼/모달용 */
  size?: 'default' | 'compact'
  className?: string
}

export function SeasonToggle({
  value,
  onChange,
  disabled = false,
  size = 'default',
  className,
}: SeasonToggleProps) {
  const isCompact = size === 'compact'

  const toggle = (key: SeasonKeys) => {
    if (disabled || !onChange) return
    onChange({ ...value, [key]: !value[key] })
  }

  return (
    <div className={cn('inline-flex gap-1', className)}>
      {SEASONS.map(({ key, label, short, color }) => {
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
                ? 'text-[10px] px-1.5 py-0.5 min-w-[24px]'
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

/** 시즌 값에서 활성화된 시즌의 짧은 라벨(Sp, Su, Fw, Wi)을 반환 */
export function getActiveSeasonLabels(value: SeasonValue): string[] {
  return SEASONS.filter(s => value[s.key]).map(s => s.short)
}

/** 시즌 도트 — 읽기 전용 표시용 */
export function SeasonDots({ value, className }: { value: SeasonValue; className?: string }) {
  const active = SEASONS.filter(s => value[s.key])
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
