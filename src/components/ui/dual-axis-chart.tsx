'use client'

import React from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── DualAxisChart ───────────────────────────────────
 *  이중 축 콤보 차트 — 매출(₩, 왼쪽) + 수수료율(%, 오른쪽) 등
 *
 *  사용법:
 *    <DualAxisChart
 *      data={monthlyData}
 *      bars={[{ dataKey: 'revenue', name: '매출', color: '#2959FD' }]}
 *      lines={[{ dataKey: 'commission_rate', name: '수수료율', color: '#FD5046' }]}
 *      leftLabel="매출 (₩)"
 *      rightLabel="수수료율 (%)"
 *      leftFormatter={fmtShort}
 *      rightFormatter={v => `${v}%`}
 *    />
 *
 *    // 막대 없이 라인 2개 (좌/우 축 분리)
 *    <DualAxisChart
 *      data={data}
 *      lines={[
 *        { dataKey: 'sales', name: '매출', color: '#2959FD', axis: 'left' },
 *        { dataKey: 'rate', name: '환율', color: '#FF9720', axis: 'right' },
 *      ]}
 *    />
 * ──────────────────────────────────────────────────── */

interface BarConfig {
  dataKey: string
  name: string
  color: string
}

interface LineConfig {
  dataKey: string
  name: string
  color: string
  /** 어느 축에 연결할지 (기본 right) */
  axis?: 'left' | 'right'
  strokeWidth?: number
  dot?: boolean
}

interface DualAxisChartProps {
  data: Record<string, unknown>[]
  bars?: BarConfig[]
  lines?: LineConfig[]
  xKey?: string
  height?: number
  /** 왼쪽 Y축 라벨 */
  leftLabel?: string
  /** 오른쪽 Y축 라벨 */
  rightLabel?: string
  leftFormatter?: (value: number) => string
  rightFormatter?: (value: number) => string
  xFormatter?: (value: string) => string
  tooltipFormatter?: (value: number) => string
  showLegend?: boolean
}

export function DualAxisChart({
  data,
  bars = [],
  lines = [],
  xKey = 'name',
  height = 280,
  leftLabel,
  rightLabel,
  leftFormatter,
  rightFormatter,
  xFormatter,
  tooltipFormatter,
  showLegend = true,
}: DualAxisChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={xFormatter} />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11 }}
          tickFormatter={leftFormatter}
          label={leftLabel ? { value: leftLabel, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#999' } } : undefined}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          tickFormatter={rightFormatter}
          label={rightLabel ? { value: rightLabel, angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#999' } } : undefined}
        />
        <Tooltip content={<SalesChartTooltip formatter={tooltipFormatter} />} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {bars.map(bar => (
          <Bar
            key={bar.dataKey}
            yAxisId="left"
            dataKey={bar.dataKey}
            name={bar.name}
            fill={bar.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
            opacity={0.8}
          />
        ))}
        {lines.map(line => (
          <Line
            key={line.dataKey}
            yAxisId={line.axis || 'right'}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={line.strokeWidth ?? 2}
            dot={line.dot ?? false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
