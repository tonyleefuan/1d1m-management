'use client'

import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── DonutChart ──────────────────────────────────────
 *  비율 시각화 — 채널별 매출 점유율, 재고 비중 등
 *
 *  사용법:
 *    <DonutChart
 *      data={[
 *        { name: '무신사', value: 5000000 },
 *        { name: '29cm', value: 3000000 },
 *      ]}
 *    />
 *
 *    // 중앙 텍스트 + 커스텀 색상
 *    <DonutChart
 *      data={data}
 *      centerLabel="총매출"
 *      centerValue="₩1.2억"
 *      colors={['#2959FD', '#04D1AE', '#FF9720']}
 *    />
 *
 *    // 반원 (180도)
 *    <DonutChart data={data} variant="half" />
 * ──────────────────────────────────────────────────── */

interface DonutDataItem {
  name: string
  value: number
}

interface DonutChartProps {
  data: DonutDataItem[]
  height?: number
  /** 색상 배열 (data 순서대로 적용) */
  colors?: string[]
  /** 도넛 두께 (기본 40) */
  thickness?: number
  /** 중앙 라벨 */
  centerLabel?: string
  /** 중앙 값 */
  centerValue?: string
  /** full = 360도(기본), half = 180도 */
  variant?: 'full' | 'half'
  /** 값 포맷 */
  formatter?: (value: number) => string
  showLegend?: boolean
}

const DEFAULT_COLORS = ['#2959FD', '#04D1AE', '#FF9720', '#8E44AD', '#FFE343', '#FD5046', '#666', '#999']

function defaultPercentFormat(value: number): string {
  return value.toLocaleString('ko-KR')
}

export function DonutChart({
  data,
  height = 280,
  colors = DEFAULT_COLORS,
  thickness = 40,
  centerLabel,
  centerValue,
  variant = 'full',
  formatter = defaultPercentFormat,
  showLegend = true,
}: DonutChartProps) {
  const isHalf = variant === 'half'
  const outerRadius = isHalf ? '90%' : '80%'
  const innerRadius = isHalf ? '65%' : '60%'

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy={isHalf ? '70%' : '50%'}
          startAngle={isHalf ? 180 : 0}
          endAngle={isHalf ? 0 : 360}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          dataKey="value"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<SalesChartTooltip formatter={formatter} />} />
        {showLegend && (
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => <span className="text-xs text-foreground">{value}</span>}
          />
        )}
        {/* 중앙 텍스트 */}
        {(centerLabel || centerValue) && (
          <>
            {centerLabel && (
              <text x="50%" y={isHalf ? '58%' : '47%'} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {centerLabel}
              </text>
            )}
            {centerValue && (
              <text x="50%" y={isHalf ? '68%' : '55%'} textAnchor="middle" className="fill-foreground text-base font-bold">
                {centerValue}
              </text>
            )}
          </>
        )}
      </PieChart>
    </ResponsiveContainer>
  )
}
