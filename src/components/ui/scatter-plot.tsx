'use client'

import React from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ZAxis,
} from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── ScatterPlot ─────────────────────────────────────
 *  산점도 — ROAS vs 빈도, 리드타임 vs 비용, 가격 vs 판매량 등
 *
 *  사용법:
 *    // 기본
 *    <ScatterPlot
 *      data={[{ x: 3.2, y: 15000, name: '캠페인A' }]}
 *      xLabel="ROAS"
 *      yLabel="지출 (₩)"
 *    />
 *
 *    // 버블 (크기 변수)
 *    <ScatterPlot
 *      data={[{ x: 3.2, y: 15000, z: 500, name: '캠페인A' }]}
 *      xLabel="ROAS"
 *      yLabel="지출"
 *      zKey="z"
 *    />
 *
 *    // 다중 그룹
 *    <ScatterPlot
 *      groups={[
 *        { name: '성과 좋음', data: goodData, color: '#04D1AE' },
 *        { name: '성과 나쁨', data: badData, color: '#FD5046' },
 *      ]}
 *    />
 * ──────────────────────────────────────────────────── */

interface ScatterDataItem {
  x: number
  y: number
  z?: number
  name?: string
}

interface ScatterGroup {
  name: string
  data: ScatterDataItem[]
  color: string
}

interface ScatterPlotProps {
  /** 단일 데이터셋 */
  data?: ScatterDataItem[]
  /** 다중 그룹 */
  groups?: ScatterGroup[]
  xKey?: string
  yKey?: string
  /** 버블 크기 키 */
  zKey?: string
  xLabel?: string
  yLabel?: string
  height?: number
  color?: string
  xFormatter?: (value: number) => string
  yFormatter?: (value: number) => string
  tooltipFormatter?: (value: number) => string
  showLegend?: boolean
}

const DEFAULT_COLOR = '#2959FD'

export function ScatterPlot({
  data,
  groups,
  xKey = 'x',
  yKey = 'y',
  zKey,
  xLabel,
  yLabel,
  height = 280,
  color = DEFAULT_COLOR,
  xFormatter,
  yFormatter,
  tooltipFormatter,
  showLegend = true,
}: ScatterPlotProps) {
  const scatterGroups = groups || (data ? [{ name: '', data, color }] : [])

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          type="number" dataKey={xKey} tick={{ fontSize: 11 }}
          tickFormatter={xFormatter}
          label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -5, style: { fontSize: 10, fill: '#999' } } : undefined}
        />
        <YAxis
          type="number" dataKey={yKey} tick={{ fontSize: 11 }}
          tickFormatter={yFormatter}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#999' } } : undefined}
        />
        {zKey && <ZAxis type="number" dataKey={zKey} range={[30, 300]} />}
        <Tooltip content={<SalesChartTooltip formatter={tooltipFormatter} />} />
        {showLegend && scatterGroups.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {scatterGroups.map((group, i) => (
          <Scatter
            key={group.name || i}
            name={group.name}
            data={group.data}
            fill={group.color}
            fillOpacity={0.7}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  )
}
