'use client'

import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

/* ── GaugeChart ──────────────────────────────────────
 *  게이지/달성률 — SKU 매칭률, 입고율, 목표 달성 등
 *
 *  사용법:
 *    // 기본 (0-100%)
 *    <GaugeChart value={73} label="매칭률" />
 *
 *    // 커스텀 최대값 + 색상
 *    <GaugeChart value={850} max={1000} label="목표 달성" color="#04D1AE" />
 *
 *    // 단계별 자동 색상 (0-33: red, 34-66: amber, 67-100: green)
 *    <GaugeChart value={45} label="진행률" autoColor />
 *
 *    // 서브텍스트
 *    <GaugeChart value={92} label="입고율" subtitle="368 / 400" />
 * ──────────────────────────────────────────────────── */

interface GaugeChartProps {
  /** 현재 값 */
  value: number
  /** 최대 값 (기본 100) */
  max?: number
  /** 중앙 라벨 */
  label?: string
  /** 중앙 서브텍스트 */
  subtitle?: string
  /** 고정 색상 */
  color?: string
  /** 단계별 자동 색상 */
  autoColor?: boolean
  /** 나머지 영역 색상 */
  trackColor?: string
  height?: number
  /** 표시 포맷 (기본: value + %) */
  valueFormatter?: (value: number, max: number) => string
}

function getAutoColor(ratio: number): string {
  if (ratio >= 0.67) return '#04D1AE'
  if (ratio >= 0.34) return '#FF9720'
  return '#FD5046'
}

export function GaugeChart({
  value,
  max = 100,
  label,
  subtitle,
  color,
  autoColor = false,
  trackColor = '#f0f0f0',
  height = 160,
  valueFormatter,
}: GaugeChartProps) {
  const ratio = Math.min(value / max, 1)
  const fillColor = color || (autoColor ? getAutoColor(ratio) : '#2959FD')
  const displayValue = valueFormatter
    ? valueFormatter(value, max)
    : `${Math.round(ratio * 100)}%`

  const gaugeData = [
    { name: 'value', value: ratio },
    { name: 'rest', value: 1 - ratio },
  ]

  return (
    <div style={{ height }} className="relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={gaugeData}
            cx="50%"
            cy="75%"
            startAngle={180}
            endAngle={0}
            innerRadius="70%"
            outerRadius="95%"
            dataKey="value"
            stroke="none"
          >
            <Cell fill={fillColor} />
            <Cell fill={trackColor} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {/* 중앙 텍스트 */}
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
        <span className="text-lg font-bold tabular-nums" style={{ color: fillColor }}>
          {displayValue}
        </span>
        {label && <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>}
        {subtitle && <span className="text-[9px] text-muted-foreground font-mono">{subtitle}</span>}
      </div>
    </div>
  )
}
