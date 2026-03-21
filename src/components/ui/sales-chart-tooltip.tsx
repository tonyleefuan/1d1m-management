'use client'

import React from 'react'
import type { TooltipProps } from 'recharts'

/* ── SalesChartTooltip ──────────────────────────────
 *  매출/금액 차트용 공통 툴팁
 *  색상 도트 + 항목명 + 포맷된 값
 *
 *  사용법:
 *    <Tooltip content={<SalesChartTooltip />} />
 *    <Tooltip content={<SalesChartTooltip formatter={fmtKrw} />} />
 *    <Tooltip content={<SalesChartTooltip labelFormatter={d => d.slice(5)} />} />
 * ──────────────────────────────────────────────────── */

interface SalesChartTooltipProps extends TooltipProps<number, string> {
  /** 값 포맷 함수 (기본: toLocaleString) */
  formatter?: (value: number) => string
  /** 라벨 포맷 함수 */
  labelFormatter?: (label: string) => string
}

function defaultFormat(n: number): string {
  if (Math.abs(n) >= 100000000) return `₩${(n / 100000000).toFixed(1)}억`
  if (Math.abs(n) >= 10000) return `₩${(n / 10000).toFixed(0)}만`
  return `₩${n.toLocaleString('ko-KR')}`
}

export const SalesChartTooltip = React.memo(function SalesChartTooltip({
  active,
  payload,
  label,
  formatter = defaultFormat,
  labelFormatter,
}: SalesChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-white p-3 shadow-md text-xs">
      <div className="font-medium mb-1 text-foreground">
        {labelFormatter ? labelFormatter(label as string) : label}
      </div>
      {payload
        .filter(p => p.value != null)
        .map((p, i) => (
          <div key={i} className="flex items-center gap-2 py-px">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="font-medium ml-auto tabular-nums">
              {typeof p.value === 'number' ? formatter(p.value) : p.value}
            </span>
          </div>
        ))}
    </div>
  )
})
