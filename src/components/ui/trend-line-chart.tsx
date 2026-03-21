'use client'

import React from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── TrendLineChart ──────────────────────────────────
 *  다중 라인 추이 차트 (일별 매출, 채널별 추이 등)
 *
 *  사용법:
 *    <TrendLineChart
 *      data={dailyData}
 *      lines={[
 *        { dataKey: 'sales', name: '매출', color: '#2959FD' },
 *        { dataKey: 'returns', name: '반품', color: '#FD5046' },
 *      ]}
 *      xKey="date"
 *    />
 *
 *    // 동적 라인 (채널별)
 *    <TrendLineChart
 *      data={channelDaily}
 *      lines={channelNames.map((name, i) => ({
 *        dataKey: name, name, color: COLORS[i]
 *      }))}
 *      xKey="date"
 *    />
 * ──────────────────────────────────────────────────── */

interface LineConfig {
  dataKey: string
  name: string
  color: string
  strokeWidth?: number
  dot?: boolean
}

interface TrendLineChartProps {
  data: Record<string, unknown>[]
  lines: LineConfig[]
  xKey?: string
  height?: number
  /** X축 라벨 포맷 */
  xFormatter?: (value: string) => string
  /** Y축 라벨 포맷 */
  yFormatter?: (value: number) => string
  /** 툴팁 값 포맷 */
  tooltipFormatter?: (value: number) => string
  showLegend?: boolean
}

export function TrendLineChart({
  data,
  lines,
  xKey = 'date',
  height = 280,
  xFormatter = d => d.slice(5),
  yFormatter,
  tooltipFormatter,
  showLegend = true,
}: TrendLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={xFormatter} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={yFormatter} />
        <Tooltip content={<SalesChartTooltip formatter={tooltipFormatter} />} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {lines.map(line => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            name={line.name}
            stroke={line.color}
            strokeWidth={line.strokeWidth ?? 2}
            dot={line.dot ?? false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
