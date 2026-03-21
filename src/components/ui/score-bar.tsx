import React from 'react'
import { cn } from '@/lib/utils'

/* ── ScoreBar ──────────────────────────────────────
 *  다색 분할 프로그레스바 — 세그먼트별 색상·라벨·값 표시
 *
 *  사용법:
 *    <ScoreBar
 *      segments={[
 *        { value: 35, color: 'bg-hh-blue', label: '수익', max: 40 },
 *        { value: 25, color: 'bg-hh-green', label: '규모', max: 35 },
 *        { value: 15, color: 'bg-hh-yellow', label: '건강', max: 20 },
 *      ]}
 *    />
 *
 *    <ScoreBar segments={segments} showLegend={false} size="md" />
 * ──────────────────────────────────────────────────── */

interface Segment {
  /** 현재 값 (바 너비 결정) */
  value: number
  /** 바 색상 (Tailwind bg 클래스) */
  color: string
  /** 범례 라벨 */
  label?: string
  /** 최대값 (범례에 "라벨 value/max"로 표시, 없으면 value만 표시) */
  max?: number
}

interface ScoreBarProps {
  segments: Segment[]
  /** 범례 표시 여부 (기본: true) */
  showLegend?: boolean
  /** 바 높이: sm(4px), md(6px), lg(8px) */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'h-1',
  md: 'h-1.5',
  lg: 'h-2',
}

export function ScoreBar({
  segments,
  showLegend = true,
  size = 'sm',
  className,
}: ScoreBarProps) {
  const total = segments.reduce((sum, s) => sum + (s.max ?? s.value), 0)

  return (
    <div className={cn('', className)}>
      {/* 바 */}
      <div className={cn('flex gap-0.5 overflow-hidden rounded-sm', sizeMap[size])}>
        {segments.map((seg, i) => (
          <div
            key={i}
            className={cn('rounded-sm', seg.color)}
            style={{ width: total > 0 ? `${(seg.value / total) * 100}%` : '0%' }}
            title={seg.label ? `${seg.label} ${seg.value}${seg.max ? `/${seg.max}` : ''}` : String(seg.value)}
          />
        ))}
      </div>

      {/* 범례 */}
      {showLegend && (
        <div className="mt-1 flex gap-2 text-[9px] text-muted-foreground">
          {segments.map((seg, i) => (
            <span key={i}>
              <span className={cn('mr-0.5 inline-block h-1.5 w-1.5 rounded-[1px] align-middle', seg.color)} />
              {seg.label} {seg.value}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
