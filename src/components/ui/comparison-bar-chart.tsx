'use client'

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── ComparisonBarChart ──────────────────────────────
 *  비교 막대 차트 (채널별, 상품별 등)
 *
 *  수직 (기본):
 *    <ComparisonBarChart
 *      data={[{ name: '무신사', 매출: 1000, 반품: 200 }]}
 *      bars={[
 *        { dataKey: '매출', color: '#2959FD' },
 *        { dataKey: '반품', color: '#FD5046' },
 *      ]}
 *    />
 *
 *  수평 (layout="horizontal"):
 *    <ComparisonBarChart
 *      data={topProducts}
 *      bars={[{ dataKey: 'revenue', name: '매출' }]}
 *      layout="horizontal"
 *      nameKey="name"
 *      cellColors={['#2959FD', '#04D1AE', ...]}
 *    />
 * ──────────────────────────────────────────────────── */

interface BarConfig {
  dataKey: string
  name?: string
  color?: string
}

interface ComparisonBarChartProps {
  data: Record<string, unknown>[]
  bars: BarConfig[]
  nameKey?: string
  height?: number
  /** vertical=일반 막대, horizontal=가로 막대 */
  layout?: 'vertical' | 'horizontal'
  /** 막대별 개별 색상 (horizontal에서 유용) */
  cellColors?: string[]
  /** Y축 라벨 포맷 */
  yFormatter?: (value: number) => string
  /** 툴팁 값 포맷 */
  tooltipFormatter?: (value: number) => string
  /** Y축 카테고리 너비 (horizontal일 때) */
  categoryWidth?: number
  showLegend?: boolean
}

const DEFAULT_COLORS = ['#2959FD', '#04D1AE', '#FF9720', '#8E44AD', '#FFE343', '#FD5046', '#666']

export function ComparisonBarChart({
  data,
  bars,
  nameKey = 'name',
  height = 280,
  layout = 'vertical',
  cellColors,
  yFormatter,
  tooltipFormatter,
  categoryWidth = 140,
  showLegend = true,
}: ComparisonBarChartProps) {
  const isHorizontal = layout === 'horizontal'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={isHorizontal ? 'vertical' : 'horizontal'}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        {isHorizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={yFormatter} />
            <YAxis
              type="category" dataKey={nameKey} tick={{ fontSize: 10 }} width={categoryWidth}
              tickFormatter={n => typeof n === 'string' && n.length > 18 ? n.slice(0, 18) + '...' : n}
            />
          </>
        ) : (
          <>
            <XAxis dataKey={nameKey} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={yFormatter} />
          </>
        )}
        <Tooltip content={<SalesChartTooltip formatter={tooltipFormatter} />} />
        {showLegend && bars.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {bars.map((bar, bi) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            name={bar.name || bar.dataKey}
            fill={bar.color || DEFAULT_COLORS[bi]}
            radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          >
            {cellColors && data.map((_, i) => (
              <Cell key={i} fill={cellColors[i % cellColors.length]} />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
