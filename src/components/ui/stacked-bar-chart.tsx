'use client'

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── StackedBarChart ─────────────────────────────────
 *  누적 막대 — 비용 구성, 매출 분해, 채널별 점유 등
 *
 *  사용법:
 *    // 누적 (기본)
 *    <StackedBarChart
 *      data={monthlyData}
 *      bars={[
 *        { dataKey: 'cost', name: '원가', color: '#FD5046' },
 *        { dataKey: 'commission', name: '수수료', color: '#FF9720' },
 *        { dataKey: 'profit', name: '이익', color: '#04D1AE' },
 *      ]}
 *    />
 *
 *    // 100% 누적 (비율)
 *    <StackedBarChart data={normalized} bars={bars} yFormatter={v => `${v}%`} />
 *
 *    // 수평 누적
 *    <StackedBarChart data={data} bars={bars} layout="horizontal" />
 * ──────────────────────────────────────────────────── */

interface BarConfig {
  dataKey: string
  name: string
  color: string
}

interface StackedBarChartProps {
  data: Record<string, unknown>[]
  bars: BarConfig[]
  nameKey?: string
  height?: number
  layout?: 'vertical' | 'horizontal'
  xFormatter?: (value: string) => string
  yFormatter?: (value: number) => string
  tooltipFormatter?: (value: number) => string
  showLegend?: boolean
  /** 막대 모서리 둥글기 (기본 4) */
  barRadius?: number
  /** 막대 최대 너비 (기본 40) */
  maxBarSize?: number
}

export function StackedBarChart({
  data,
  bars,
  nameKey = 'name',
  height = 280,
  layout = 'vertical',
  xFormatter,
  yFormatter,
  tooltipFormatter,
  showLegend = true,
  barRadius = 4,
  maxBarSize = 40,
}: StackedBarChartProps) {
  const isHorizontal = layout === 'horizontal'
  const lastIdx = bars.length - 1

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={isHorizontal ? 'vertical' : 'horizontal'}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        {isHorizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={yFormatter} />
            <YAxis type="category" dataKey={nameKey} tick={{ fontSize: 10 }} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} tickFormatter={xFormatter} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={yFormatter} />
          </>
        )}
        <Tooltip content={<SalesChartTooltip formatter={tooltipFormatter} />} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {bars.map((bar, i) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name}
            stackId="stack"
            fill={bar.color}
            maxBarSize={maxBarSize}
            radius={i === lastIdx
              ? (isHorizontal ? [0, barRadius, barRadius, 0] : [barRadius, barRadius, 0, 0])
              : [0, 0, 0, 0]
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
