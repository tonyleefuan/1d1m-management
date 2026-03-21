'use client'

import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── StackedAreaChart ────────────────────────────────
 *  누적 영역 차트 — 재고 변동, 현금 흐름, 매출 구성 등
 *
 *  사용법:
 *    // 누적 (기본)
 *    <StackedAreaChart
 *      data={dailyInventory}
 *      areas={[
 *        { dataKey: 'available', name: '가용', color: '#04D1AE' },
 *        { dataKey: 'reserved', name: '예약', color: '#FF9720' },
 *        { dataKey: 'damaged', name: '불량', color: '#FD5046' },
 *      ]}
 *    />
 *
 *    // 비누적 (겹치기)
 *    <StackedAreaChart data={data} areas={areas} stacked={false} />
 *
 *    // 그라데이션 커스텀
 *    <StackedAreaChart data={data} areas={areas} gradientOpacity={0.3} />
 * ──────────────────────────────────────────────────── */

interface AreaConfig {
  dataKey: string
  name: string
  color: string
}

interface StackedAreaChartProps {
  data: Record<string, unknown>[]
  areas: AreaConfig[]
  xKey?: string
  height?: number
  /** 누적 여부 (기본 true) */
  stacked?: boolean
  /** 그라데이션 불투명도 (기본 0.3) */
  gradientOpacity?: number
  xFormatter?: (value: string) => string
  yFormatter?: (value: number) => string
  tooltipFormatter?: (value: number) => string
  showLegend?: boolean
}

export function StackedAreaChart({
  data,
  areas,
  xKey = 'date',
  height = 280,
  stacked = true,
  gradientOpacity = 0.3,
  xFormatter = d => d.slice(5),
  yFormatter,
  tooltipFormatter,
  showLegend = true,
}: StackedAreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          {areas.map(area => (
            <linearGradient key={area.dataKey} id={`grad-${area.dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={area.color} stopOpacity={gradientOpacity} />
              <stop offset="95%" stopColor={area.color} stopOpacity={0.05} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickFormatter={xFormatter} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={yFormatter} />
        <Tooltip content={<SalesChartTooltip formatter={tooltipFormatter} />} />
        {showLegend && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {areas.map(area => (
          <Area
            key={area.dataKey}
            type="monotone"
            dataKey={area.dataKey}
            name={area.name}
            stroke={area.color}
            fill={`url(#grad-${area.dataKey})`}
            strokeWidth={2}
            stackId={stacked ? 'stack' : undefined}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
