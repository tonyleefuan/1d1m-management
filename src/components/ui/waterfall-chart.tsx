'use client'

import React, { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts'
import { SalesChartTooltip } from './sales-chart-tooltip'

/* ── WaterfallChart ──────────────────────────────────
 *  폭포형 차트 — P&L 분해, 비용 구성, 현금 흐름 변동 등
 *
 *  사용법:
 *    <WaterfallChart
 *      items={[
 *        { name: '매출', value: 10000000 },
 *        { name: '원가', value: -2800000 },
 *        { name: '수수료', value: -1500000 },
 *        { name: '광고비', value: -1000000 },
 *        { name: '영업이익', value: 4700000, isTotal: true },
 *      ]}
 *    />
 *
 *    // 색상 커스텀
 *    <WaterfallChart
 *      items={items}
 *      positiveColor="#04D1AE"
 *      negativeColor="#FD5046"
 *      totalColor="#2959FD"
 *    />
 * ──────────────────────────────────────────────────── */

interface WaterfallItem {
  name: string
  value: number
  /** 합계 항목 여부 (0부터 시작하는 막대) */
  isTotal?: boolean
}

interface WaterfallChartProps {
  items: WaterfallItem[]
  height?: number
  positiveColor?: string
  negativeColor?: string
  totalColor?: string
  formatter?: (value: number) => string
}

function defaultFormat(n: number): string {
  if (Math.abs(n) >= 100000000) return `₩${(n / 100000000).toFixed(1)}억`
  if (Math.abs(n) >= 10000) return `₩${(n / 10000).toFixed(0)}만`
  return `₩${n.toLocaleString('ko-KR')}`
}

export function WaterfallChart({
  items,
  height = 280,
  positiveColor = '#04D1AE',
  negativeColor = '#FD5046',
  totalColor = '#2959FD',
  formatter = defaultFormat,
}: WaterfallChartProps) {
  // 폭포형 데이터 변환: 각 막대의 base(투명) + visible 높이 계산
  const chartData = useMemo(() => {
    let runningTotal = 0
    return items.map(item => {
      if (item.isTotal) {
        const result = {
          name: item.name,
          base: 0,
          value: item.value,
          original: item.value,
          isTotal: true,
        }
        runningTotal = item.value
        return result
      }

      const base = item.value >= 0 ? runningTotal : runningTotal + item.value
      const result = {
        name: item.name,
        base: Math.max(0, base),
        value: Math.abs(item.value),
        original: item.value,
        isTotal: false,
      }
      runningTotal += item.value
      return result
    })
  }, [items])

  const getColor = (entry: typeof chartData[0]) => {
    if (entry.isTotal) return totalColor
    return entry.original >= 0 ? positiveColor : negativeColor
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => {
          if (Math.abs(v) >= 100000000) return `${(v / 100000000).toFixed(0)}억`
          if (Math.abs(v) >= 10000) return `${(v / 10000).toFixed(0)}만`
          return String(v)
        }} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[1]) return null
            const item = payload[1].payload
            return (
              <div className="rounded-lg border bg-white p-3 shadow-md text-xs">
                <div className="font-medium mb-1">{item.name}</div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: getColor(item) }} />
                  <span className="font-medium tabular-nums">{formatter(item.original)}</span>
                </div>
              </div>
            )
          }}
        />
        <ReferenceLine y={0} stroke="#e0e0e0" />
        {/* 투명 base 막대 */}
        <Bar dataKey="base" stackId="waterfall" fill="transparent" />
        {/* 실제 값 막대 */}
        <Bar dataKey="value" stackId="waterfall" radius={[3, 3, 0, 0]} maxBarSize={50}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={getColor(entry)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
